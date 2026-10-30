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

export const PRESET_CLIPS: ShadowingClip[] = [];
