import { ShadowingClip, SubtitleLine } from '../../types';

// Utility functions kept for creating custom clips or fallbacks
export const interpolateWords = (text: string, start: number, end: number) => {
  const words = text.split(' ').filter(Boolean);
  const duration = Math.max(0.2, end - start);
  const timePerWord = duration / words.length;
  
  let currentStart = start;
  return words.map(w => {
    const wordEnd = currentStart + timePerWord;
    const wordObj = { text: w, start: currentStart, end: wordEnd };
    currentStart = wordEnd;
    return wordObj;
  });
};

const COMMON_ABBREVIATIONS = new Set([
  'mr.', 'mrs.', 'ms.', 'dr.', 'prof.', 'sr.', 'jr.', 'vs.', 'etc.',
  'approx.', 'apt.', 'dept.', 'est.', 'u.s.', 'u.k.', 'e.g.', 'i.e.'
]);

export const reconstructSubtitlesSemantically = (lines: SubtitleLine[]): SubtitleLine[] => {
  if (!lines || lines.length === 0) return [];

  // 1. Flatten all word tokens
  const rawWords: { text: string; start: number; end: number }[] = [];
  for (const line of lines) {
    if (line.words && line.words.length > 0) {
      for (const w of line.words) {
        if (w && w.text) {
          rawWords.push({
            text: w.text,
            start: Number(w.start) || line.start,
            end: Number(w.end) || line.end
          });
        }
      }
    } else if (line.text && line.text.trim()) {
      const split = interpolateWords(line.text.trim(), line.start, line.end);
      for (const w of split) {
        rawWords.push(w);
      }
    }
  }

  if (rawWords.length === 0) return lines;

  // 2. Clean word tokens: strip sound tags, music symbols, speaker prefixes, decode entities
  const cleanWords: { text: string; start: number; end: number }[] = [];
  let prevText = '';
  let prevStart = -1;

  for (const w of rawWords) {
    let t = decodeEntities(w.text)
      .replace(/<[^>]+>/g, '')
      .replace(/^[>\s]+/, '')
      .trim();

    // Strip [music], (applause), etc.
    if (/^\[.*?\]$/.test(t) || /^\(.*?\)$/.test(t)) continue;

    // Strip music notes ♪ ♫
    t = t.replace(/[♪♫]/g, '').trim();
    if (!t) continue;

    // Deduplicate repeated ASR rolling words within 0.8s window
    const wClean = t.replace(/[^\w]/g, '').toLowerCase();
    const pClean = prevText.replace(/[^\w]/g, '').toLowerCase();
    if (wClean && wClean === pClean && Math.abs(w.start - prevStart) < 0.8) {
      continue;
    }

    cleanWords.push({
      text: t,
      start: w.start,
      end: w.end
    });
    prevText = t;
    prevStart = w.start;
  }

  if (cleanWords.length === 0) return [];

  // 3. Assemble into single, complete sentences ending with terminal punctuation (dot '.')
  const sentences: SubtitleLine[] = [];
  let currentWords: { text: string; start: number; end: number }[] = [];

  for (let i = 0; i < cleanWords.length; i++) {
    const word = cleanWords[i];
    currentWords.push({ ...word });
    const isLast = i === cleanWords.length - 1;

    // Sentence termination check
    const endsWithTerminal = /[.?!]["'”’]?$/.test(word.text) && !COMMON_ABBREVIATIONS.has(word.text.toLowerCase());
    
    // Natural pause check: only break on speech pause if no punctuation for 8+ words
    let isPause = false;
    if (i < cleanWords.length - 1) {
      const gap = cleanWords[i + 1].start - word.end;
      if (gap >= 1.5 && currentWords.length >= 8) {
        isPause = true;
      }
    }

    // Only force-break if a single sentence exceeds 35 words without punctuation
    const isRunaway = currentWords.length >= 35;
    const shouldBreak = isLast || endsWithTerminal || isPause || isRunaway;

    if (shouldBreak && currentWords.length > 0) {
      // Monotonize word timestamps ONLY within this individual sentence (preserves true video sync)
      for (let j = 1; j < currentWords.length; j++) {
        if (currentWords[j].start < currentWords[j - 1].start) {
          currentWords[j].start = currentWords[j - 1].end;
        }
        if (currentWords[j].end <= currentWords[j].start) {
          currentWords[j].end = Math.round((currentWords[j].start + 0.25) * 100) / 100;
        }
      }
      let sentenceText = currentWords.map(w => w.text).join(' ').trim();

      // Ensure first character is uppercase
      if (sentenceText.length > 0) {
        sentenceText = sentenceText.charAt(0).toUpperCase() + sentenceText.slice(1);
        currentWords[0].text = currentWords[0].text.charAt(0).toUpperCase() + currentWords[0].text.slice(1);
      }

      // Guarantee ending with terminal dot '.' (or ? / !)
      if (!/[.?!]["']?$/.test(sentenceText)) {
        sentenceText = sentenceText.replace(/[,;:-]$/, '') + '.';
        const lastIdx = currentWords.length - 1;
        currentWords[lastIdx].text = currentWords[lastIdx].text.replace(/[,;:-]$/, '') + '.';
      }

      const sStart = Math.round(currentWords[0].start * 100) / 100;
      const sEnd = Math.max(Math.round(currentWords[currentWords.length - 1].end * 100) / 100, sStart + 0.5);

      sentences.push({
        id: `cue-${sentences.length + 1}`,
        start: sStart,
        end: sEnd,
        text: sentenceText,
        words: [...currentWords],
        translation: ''
      });
      currentWords = [];
    }
  }

  // 5. Ensure non-overlapping sentence timestamps
  for (let i = 0; i < sentences.length - 1; i++) {
    if (sentences[i].end > sentences[i + 1].start) {
      sentences[i].end = sentences[i + 1].start;
    }
    if (sentences[i].end <= sentences[i].start) {
      sentences[i].end = Math.round((sentences[i].start + 0.5) * 100) / 100;
    }
  }

  return sentences;
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

export function parseTranscriptXml(xml: string): SubtitleLine[] {
  const pRegex = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;
  const sRegex = /<s(?:\s+t="(\d+)")?[^>]*>([\s\S]*?)<\/s>/g;

  let allWords: any[] = [];
  let pMatch;

  while ((pMatch = pRegex.exec(xml)) !== null) {
    const pStartMs = parseInt(pMatch[1], 10);
    const inner = pMatch[3].trim();
    if (!inner || (inner.startsWith('[') && inner.endsWith(']'))) continue;

    let sMatch;
    let hasS = false;
    while ((sMatch = sRegex.exec(inner)) !== null) {
      hasS = true;
      const sOffsetMs = sMatch[1] ? parseInt(sMatch[1], 10) : 0;
      const wordText = decodeEntities(sMatch[2]).trim();
      if (!wordText) continue;

      const wStart = Math.round((pStartMs + sOffsetMs) / 10) / 100;
      allWords.push({
        text: wordText,
        start: wStart,
        end: wStart + 0.35
      });
    }

    if (!hasS) {
      const text = decodeEntities(inner.replace(/<[^>]+>/g, '')).trim();
      if (text) {
        const pDurMs = pMatch[2] ? parseInt(pMatch[2], 10) : 2500;
        const start = Math.round(pStartMs / 10) / 100;
        const dur = Math.round(pDurMs / 10) / 100;
        const rawWords = text.split(/\s+/).filter(Boolean);
        const wordDur = dur / Math.max(rawWords.length, 1);
        rawWords.forEach((w, wIdx) => {
          allWords.push({
            text: w,
            start: Math.round((start + wIdx * wordDur) * 100) / 100,
            end: Math.round((start + (wIdx + 1) * wordDur) * 100) / 100
          });
        });
      }
    }
  }

  if (allWords.length === 0) {
    const classicRegex = /<text\s+start="([\d.]+)"(?:\s+dur="([\d.]+)")?[^>]*>([\s\S]*?)<\/text>/g;
    let cMatch;
    while ((cMatch = classicRegex.exec(xml)) !== null) {
      const start = parseFloat(cMatch[1]);
      const dur = cMatch[2] ? parseFloat(cMatch[2]) : 2.5;
      const text = decodeEntities(cMatch[3].replace(/<[^>]+>/g, '')).trim();
      if (!text || (text.startsWith('[') && text.endsWith(']'))) continue;

      const rawWords = text.split(/\s+/).filter(Boolean);
      const wordDur = dur / Math.max(rawWords.length, 1);
      rawWords.forEach((w, wIdx) => {
        allWords.push({
          text: w,
          start: Math.round((start + wIdx * wordDur) * 100) / 100,
          end: Math.round((start + (wIdx + 1) * wordDur) * 100) / 100
        });
      });
    }
  }

  if (allWords.length === 0) return [];

  const sentences: SubtitleLine[] = [];
  let currentWords: any[] = [];

  for (let i = 0; i < allWords.length; i++) {
    const word = allWords[i];
    currentWords.push(word);

    const hasEndPunct = /[.?!]”?"?$/.test(word.text);
    const isPause = i < allWords.length - 1 && (allWords[i+1].start - word.end > 0.8);
    const isTooLong = currentWords.length > 20;
    const isLast = i === allWords.length - 1;

    let shouldBreak = isLast || hasEndPunct;
    if (!shouldBreak && (isPause || isTooLong) && currentWords.length >= 5) {
      shouldBreak = true;
    }

    if (shouldBreak && currentWords.length > 0) {
      const start = currentWords[0].start;
      const end = currentWords[currentWords.length - 1].end;
      const text = currentWords.map(w => w.text).join(' ');
      sentences.push({
        id: `yt-xml-${sentences.length + 1}`,
        start,
        end: Math.max(end, start + 0.5),
        text,
        words: [...currentWords],
        translation: ""
      });
      currentWords = [];
    }
  }

  return reconstructSubtitlesSemantically(sentences);
}

export const parseRawSRTtoSubtitles = (rawText: string): SubtitleLine[] => {
  if (!rawText || !rawText.trim()) return [];

  // Check if XML format
  if (rawText.includes('<p ') || rawText.includes('<text ') || rawText.includes('<transcript>')) {
    return parseTranscriptXml(rawText);
  }

  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const cleaned = normalized.replace(/^WEBVTT[^\n]*\n+/i, '').trim();
  const blocks = cleaned.split(/\n\s*\n/);
  const results: SubtitleLine[] = [];

  blocks.forEach((block, index) => {
    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return;

    const timecodeIndex = lines.findIndex(l => 
      l.includes('-->') || 
      /(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{2,3}\s*,\s*(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{2,3}/.test(l)
    );
    if (timecodeIndex === -1) return;

    const timecodeLine = lines[timecodeIndex];
    const textLines = lines.slice(timecodeIndex + 1).join(' ')
      .replace(/<[^>]+>/g, '')
      .trim();

    if (!textLines) return;

    const timeMatch = timecodeLine.match(/(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{2,3})\s*(?:-->|,)\s*(?:(\d{1,2}):)?(\d{2}):(\d{2})[.,](\d{2,3})/);

    if (timeMatch) {
      const startH = timeMatch[1] ? parseInt(timeMatch[1], 10) : 0;
      const startM = parseInt(timeMatch[2], 10);
      const startS = parseInt(timeMatch[3], 10);
      const startMsStr = timeMatch[4].padEnd(3, '0').slice(0, 3);
      const startMs = parseInt(startMsStr, 10);

      const endH = timeMatch[5] ? parseInt(timeMatch[5], 10) : 0;
      const endM = parseInt(timeMatch[6], 10);
      const endS = parseInt(timeMatch[7], 10);
      const endMsStr = timeMatch[8].padEnd(3, '0').slice(0, 3);
      const endMs = parseInt(endMsStr, 10);

      const startTime = Math.round(((startH * 3600) + (startM * 60) + startS + (startMs / 1000)) * 100) / 100;
      const endTime = Math.round(((endH * 3600) + (endM * 60) + endS + (endMs / 1000)) * 100) / 100;

      results.push({
        id: `cue-${index + 1}`,
        start: startTime,
        end: Math.max(endTime, startTime + 0.5),
        text: textLines,
        words: interpolateWords(textLines, startTime, Math.max(endTime, startTime + 0.5)),
        translation: ""
      });
    }
  });

  return reconstructSubtitlesSemantically(results);
};

export const parsePlainTextToSubtitles = (text: string, baseStartSeconds: number = 0, secondsPerLine: number = 4.5): SubtitleLine[] => {
  const lines = text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && !/^\d+$/.test(l));

  let currentStart = baseStartSeconds;
  const res = lines.map((line, idx) => {
    const matchTime = line.match(/^\[?(\d{1,2}):(\d{2})\]?\s*(.*)$/);
    let lineText = line;
    let start = currentStart;
    let dur = secondsPerLine;

    if (matchTime) {
      const mins = parseInt(matchTime[1], 10);
      const secs = parseInt(matchTime[2], 10);
      start = mins * 60 + secs;
      lineText = matchTime[3];
    }

    const end = Math.round((start + dur) * 100) / 100;
    currentStart = end + 0.5;

    return {
      id: `custom-line-${idx + 1}`,
      start: Math.round(start * 100) / 100,
      end,
      text: lineText,
      words: interpolateWords(lineText, start, end),
      translation: ""
    };
  });
  return reconstructSubtitlesSemantically(res);
};

export const PRESET_CLIPS: ShadowingClip[] = [
  {
    id: 'chasseur-de-bot',
    title: 'Un chasseur de bot raconte comment il traque des ados millionnaires',
    youtubeId: 'ch8J7uVEddc',
    thumbnail: 'https://img.youtube.com/vi/ch8J7uVEddc/hqdefault.jpg',
    category: 'Français 🇫🇷',
    subtitles: [
      {
        id: 'cb-1',
        start: 0.0,
        end: 4.62,
        text: "Est-ce que vous avez essayé d'acheter des places pour le concert de Céline ?",
        words: interpolateWords("Est-ce que vous avez essayé d'acheter des places pour le concert de Céline ?", 0.0, 4.62),
        translation: "Have you tried to buy tickets for Celine's concert?"
      },
      {
        id: 'cb-2',
        start: 4.64,
        end: 9.06,
        text: "Que ce soit pour ça ou pour des vêtements suprêmes, c'est toujours la même histoire.",
        words: interpolateWords("Que ce soit pour ça ou pour des vêtements suprêmes, c'est toujours la même histoire.", 4.64, 9.06),
        translation: "Whether it's for that or Supreme clothing, it's always the same story."
      },
      {
        id: 'cb-3',
        start: 9.16,
        end: 16.84,
        text: "Les ventes flash en ligne, c'est des files d'attente énormes, les prix qui grimpent en flèche pour au final des ruptures de stock 2 minutes après.",
        words: interpolateWords("Les ventes flash en ligne, c'est des files d'attente énormes, les prix qui grimpent en flèche pour au final des ruptures de stock 2 minutes après.", 9.16, 16.84),
        translation: "Flash sales online mean massive queues, skyrocketing prices, only to sell out 2 minutes after launch."
      },
      {
        id: 'cb-4',
        start: 16.85,
        end: 21.64,
        text: "Et en fait, ça n'est pas de la malchance.",
        words: interpolateWords("Et en fait, ça n'est pas de la malchance.", 16.85, 21.64),
        translation: "And in fact, it's not bad luck."
      },
      {
        id: 'cb-5',
        start: 21.65,
        end: 27.50,
        text: "Des ados utilisent des robots programmés pour rafler tous les stocks en une fraction de seconde.",
        words: interpolateWords("Des ados utilisent des robots programmés pour rafler tous les stocks en une fraction de seconde.", 21.65, 27.50),
        translation: "Teens use automated bots to sweep up all the inventory in a fraction of a second."
      },
      {
        id: 'cb-6',
        start: 27.51,
        end: 33.20,
        text: "Aujourd'hui, je vous emmène dans les coulisses de la traque de ces réseaux clandestins.",
        words: interpolateWords("Aujourd'hui, je vous emmène dans les coulisses de la traque de ces réseaux clandestins.", 27.51, 33.20),
        translation: "Today, I'm taking you behind the scenes of tracking down these underground networks."
      }
    ]
  },
  {
    id: 'le-petit-prince',
    title: 'Le Petit Prince - L’essentiel est invisible pour les yeux',
    youtubeId: 'xsmv-znZqik',
    thumbnail: 'https://img.youtube.com/vi/xsmv-znZqik/hqdefault.jpg',
    category: 'Français 🇫🇷',
    subtitles: [
      {
        id: 'lpp-1',
        start: 1.0,
        end: 5.5,
        text: "Voici mon secret. Il est très simple : on ne voit bien qu'avec le cœur.",
        words: interpolateWords("Voici mon secret. Il est très simple : on ne voit bien qu'avec le cœur.", 1.0, 5.5),
        translation: "Here is my secret. It is very simple: it is only with the heart that one can see rightly."
      },
      {
        id: 'lpp-2',
        start: 6.0,
        end: 10.5,
        text: "L'essentiel est invisible pour les yeux.",
        words: interpolateWords("L'essentiel est invisible pour les yeux.", 6.0, 10.5),
        translation: "What is essential is invisible to the eye."
      },
      {
        id: 'lpp-3',
        start: 11.0,
        end: 16.0,
        text: "C'est le temps que tu as perdu pour ta rose qui fait ta rose si importante.",
        words: interpolateWords("C'est le temps que tu as perdu pour ta rose qui fait ta rose si importante.", 11.0, 16.0),
        translation: "It is the time you have wasted for your rose that makes your rose so important."
      },
      {
        id: 'lpp-4',
        start: 16.5,
        end: 22.0,
        text: "Tu deviens responsable pour toujours de ce que tu as apprivoisé.",
        words: interpolateWords("Tu deviens responsable pour toujours de ce que tu as apprivoisé.", 16.5, 22.0),
        translation: "You become responsible, forever, for what you have tamed."
      }
    ]
  },
  {
    id: 'steve-jobs-stanford',
    title: 'Steve Jobs - Stay Hungry, Stay Foolish',
    youtubeId: 'UF8uR6Z6KLc',
    thumbnail: 'https://img.youtube.com/vi/UF8uR6Z6KLc/hqdefault.jpg',
    category: 'Inspiration',
    subtitles: [
      {
        id: 'sj-1',
        start: 782.0,
        end: 786.5,
        text: "Your time is limited, so don't waste it living someone else's life.",
        words: interpolateWords("Your time is limited, so don't waste it living someone else's life.", 782.0, 786.5),
        translation: "Votre temps est précieux, ne le gâchez pas en menant une vie qui n'est pas la vôtre."
      },
      {
        id: 'sj-2',
        start: 787.0,
        end: 792.0,
        text: "Don't be trapped by dogma, which is living with the results of other people's thinking.",
        words: interpolateWords("Don't be trapped by dogma, which is living with the results of other people's thinking.", 787.0, 792.0),
        translation: "Ne vous laissez pas enfermer par les dogmes, qui vous font vivre selon les pensées d'autrui."
      },
      {
        id: 'sj-3',
        start: 792.5,
        end: 797.5,
        text: "Don't let the noise of others' opinions drown out your own inner voice.",
        words: interpolateWords("Don't let the noise of others' opinions drown out your own inner voice.", 792.5, 797.5),
        translation: "Ne laissez pas le brouhaha des opinions d'autrui étouffer votre voix intérieure."
      },
      {
        id: 'sj-4',
        start: 798.0,
        end: 804.0,
        text: "And most important, have the courage to follow your heart and intuition.",
        words: interpolateWords("And most important, have the courage to follow your heart and intuition.", 798.0, 804.0),
        translation: "Et surtout, ayez le courage de suivre votre cœur et votre intuition."
      },
      {
        id: 'sj-5',
        start: 804.5,
        end: 809.5,
        text: "They somehow already know what you truly want to become.",
        words: interpolateWords("They somehow already know what you truly want to become.", 804.5, 809.5),
        translation: "Ils savent déjà, d'une certaine façon, ce que vous voulez vraiment devenir."
      },
      {
        id: 'sj-6',
        start: 865.0,
        end: 871.0,
        text: "Stay hungry, stay foolish. Thank you all very much.",
        words: interpolateWords("Stay hungry, stay foolish. Thank you all very much.", 865.0, 871.0),
        translation: "Soyez insatiables, soyez fous. Merci beaucoup à tous."
      }
    ]
  },
  {
    id: 'pursuit-of-happyness',
    title: 'The Pursuit of Happyness - Protect Your Dream',
    youtubeId: 'DMOBlEcRuw8',
    thumbnail: 'https://img.youtube.com/vi/DMOBlEcRuw8/hqdefault.jpg',
    category: 'Cinema',
    subtitles: [
      {
        id: 'poh-1',
        start: 45.0,
        end: 49.5,
        text: "Don't ever let somebody tell you you can't do something.",
        words: interpolateWords("Don't ever let somebody tell you you can't do something.", 45.0, 49.5),
        translation: "Ne laisse jamais personne te dire que tu ne peux pas faire quelque chose."
      },
      {
        id: 'poh-2',
        start: 50.0,
        end: 52.5,
        text: "Not even me, all right?",
        words: interpolateWords("Not even me, all right?", 50.0, 52.5),
        translation: "Pas même moi, d'accord ?"
      },
      {
        id: 'poh-3',
        start: 53.0,
        end: 56.5,
        text: "You got a dream, you gotta protect it.",
        words: interpolateWords("You got a dream, you gotta protect it.", 53.0, 56.5),
        translation: "Tu as un rêve, tu dois le protéger."
      },
      {
        id: 'poh-4',
        start: 57.0,
        end: 62.0,
        text: "People can't do something themselves, they wanna tell you you can't do it.",
        words: interpolateWords("People can't do something themselves, they wanna tell you you can't do it.", 57.0, 62.0),
        translation: "Ceux qui ne peuvent pas faire quelque chose eux-mêmes te diront que tu n'en es pas capable."
      },
      {
        id: 'poh-5',
        start: 62.5,
        end: 66.0,
        text: "If you want something, go get it. Period.",
        words: interpolateWords("If you want something, go get it. Period.", 62.5, 66.0),
        translation: "Si tu veux quelque chose, va le chercher. Point final."
      }
    ]
  }
];
