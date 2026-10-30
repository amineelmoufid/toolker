// Cloudflare Pages Function: /api/transcript
// High-Reliability YouTube Subtitle Extraction Pipeline
// Handles GET /api/transcript?v={videoId}&lang={lang}

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
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

function assembleSemanticSentences(words: any[]) {
  const sentences: any[] = [];
  let currentSentence: any[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    currentSentence.push(word);

    // Check for natural sentence boundaries
    const hasSentenceEndPunctuation = /[.?!]”?"?$/.test(word.text);
    const isPause = i < words.length - 1 && (words[i + 1].start - word.end > 0.75);
    const isExcessivelyLong = currentSentence.length > 22;
    const isLastWord = i === words.length - 1;

    let shouldBreak = isLastWord || hasSentenceEndPunctuation;

    if (!shouldBreak && (isPause || isExcessivelyLong)) {
      if (currentSentence.length >= 4) {
        shouldBreak = true;
      }
    }

    if (shouldBreak) {
      if (currentSentence.length > 0) {
        // Karaoke timing stretch
        for (let j = 0; j < currentSentence.length - 1; j++) {
          currentSentence[j].end = Math.max(currentSentence[j].end, currentSentence[j + 1].start);
        }

        let lastWord = currentSentence[currentSentence.length - 1];
        if (i < words.length - 1) {
          lastWord.end = Math.min(lastWord.start + 0.5, words[i + 1].start);
        } else {
          lastWord.end = lastWord.start + 0.5;
        }

        let text = currentSentence.map((w: any) => w.text).join(' ').trim();
        if (text.length > 0) {
          text = text.charAt(0).toUpperCase() + text.slice(1);
          currentSentence[0].text = currentSentence[0].text.charAt(0).toUpperCase() + currentSentence[0].text.slice(1);
        }
        if (!/[.?!]["']?$/.test(text)) {
          text = text.replace(/[,;:-]$/, '') + '.';
          const lastIdx = currentSentence.length - 1;
          currentSentence[lastIdx].text = currentSentence[lastIdx].text.replace(/[,;:-]$/, '') + '.';
        }

        sentences.push({
          id: `sub-${sentences.length + 1}`,
          start: currentSentence[0].start,
          end: lastWord.end,
          text,
          words: [...currentSentence]
        });
        currentSentence = [];
      }
    }
  }

  // Clean overlaps
  for (let i = 0; i < sentences.length - 1; i++) {
    if (sentences[i].end > sentences[i + 1].start) {
      sentences[i].end = sentences[i + 1].start;
    }
  }

  return sentences;
}

function parseTranscriptXml(xml: string) {
  const pRegex = /<p\s+t="(\d+)"(?:\s+d="(\d+)")?[^>]*>([\s\S]*?)<\/p>/g;
  const sRegex = /<s(?:\s+t="(\d+)")?[^>]*>([\s\S]*?)<\/s>/g;

  let allWords: any[] = [];
  let pMatch;

  // 1. Try srv3 format with word-level speech recognition tags <s>
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

    // Manual subtitles in srv3 format (<p> without <s>)
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

  // 2. Fallback to classic format <text start="s" dur="s">...</text>
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

  if (allWords.length > 0) {
    return assembleSemanticSentences(allWords);
  }

  return [];
}

// Extract bracket-depth JSON for captionTracks from HTML
function extractCaptionTracksFromHtml(html: string): any[] | null {
  const key = '"captionTracks":';
  const keyIdx = html.indexOf(key);
  if (keyIdx === -1) return null;
  const startIdx = html.indexOf('[', keyIdx);
  if (startIdx === -1) return null;

  let depth = 0;
  for (let i = startIdx; i < html.length; i++) {
    if (html[i] === '[') depth++;
    else if (html[i] === ']') {
      depth--;
      if (depth === 0) {
        try {
          const jsonStr = html.slice(startIdx, i + 1);
          const parsed = JSON.parse(jsonStr);
          if (Array.isArray(parsed) && parsed.length > 0) {
            return parsed;
          }
        } catch (_) {}
        return null;
      }
    }
  }
  return null;
}

export const onRequestGet = async (context: any) => {
  const url = new URL(context.request.url);
  const videoId = url.searchParams.get('v') || url.searchParams.get('videoId');
  const requestedLang = url.searchParams.get('lang')?.toLowerCase();

  if (!videoId || videoId.length !== 11) {
    return new Response(JSON.stringify({ error: "Invalid YouTube video ID. Must be 11 characters." }), {
      status: 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }

  // 0. CHECK STATIC PRE-GENERATED ASSETS (Fastest, zero-rate-limit, 100% authentic dialogue)
  try {
    const staticUrl = new URL(`/transcripts/${videoId}.json`, context.request.url);
    const staticRes = await fetch(staticUrl);
    if (staticRes.ok) {
      const staticData: any = await staticRes.json();
      if (staticData && Array.isArray(staticData.subtitles) && staticData.subtitles.length > 0) {
        return new Response(JSON.stringify(staticData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=604800, s-maxage=604800'
          }
        });
      }
    }
  } catch (_) {}

  // 0.5. CHECK GITHUB RAW CDN (Instant cache from cloud runner)
  try {
    const ghRawUrl = `https://raw.githubusercontent.com/amineelmoufid/toolker/main/public/transcripts/${videoId}.json?_t=${Date.now()}`;
    const ghRes = await fetch(ghRawUrl);
    if (ghRes.ok) {
      const ghData: any = await ghRes.json();
      if (ghData && Array.isArray(ghData.subtitles) && ghData.subtitles.length > 0) {
        return new Response(JSON.stringify(ghData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=604800, s-maxage=604800'
          }
        });
      }
    }
  } catch (_) {}

  // 0. CHECK CLOUDFLARE EDGE CACHE (Bypass YouTube entirely if already cached)
  let cache: any = null;
  let cacheKey: Request | null = null;
  try {
    if (typeof caches !== 'undefined' && (caches as any).default) {
      cache = (caches as any).default;
      const normalizedUrl = new URL(context.request.url);
      normalizedUrl.searchParams.delete('_t');
      normalizedUrl.searchParams.delete('t');
      cacheKey = new Request(normalizedUrl.toString());
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        return cachedResponse;
      }
    }
  } catch (_) {}

  let videoTitle = `YouTube Video (${videoId})`;
  try {
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembedRes.ok) {
      const oembedData: any = await oembedRes.json();
      if (oembedData.title) videoTitle = oembedData.title;
    }
  } catch (e) {}

  try {
    let captionTracks: any[] = [];
    let itData: any = null;
    let watchStatus = 0;
    let watchHtmlLen = 0;
    let watchHasCaptions = false;
    let watchParsedCount = 0;

    // 1. PRIMARY ENGINE: Android InnerTube specification
    const INNERTUBE_API_URL = 'https://www.youtube.com/youtubei/v1/player?prettyPrint=false';
    const INNERTUBE_CLIENT_VERSION = '20.10.38';
    const INNERTUBE_USER_AGENT = `com.google.android.youtube/${INNERTUBE_CLIENT_VERSION} (Linux; U; Android 14)`;

    let detectedAudioLang: string | null = null;
    let primaryCaptionIdxFromAudio: number | null = null;

    try {
      const itRes = await fetch(INNERTUBE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': INNERTUBE_USER_AGENT
        },
        body: JSON.stringify({
          context: {
            client: {
              clientName: 'ANDROID',
              clientVersion: INNERTUBE_CLIENT_VERSION
            }
          },
          videoId
        })
      });

      if (itRes.ok) {
        itData = await itRes.json();
        const renderer = itData?.captions?.playerCaptionsTracklistRenderer;
        const tracks = renderer?.captionTracks;
        if (Array.isArray(tracks) && tracks.length > 0) {
          captionTracks = tracks;
        }

        const audioTracks = renderer?.audioTracks;
        const defaultAudioIdx = renderer?.defaultAudioTrackIndex ?? 0;
        if (Array.isArray(audioTracks) && audioTracks[defaultAudioIdx]) {
          const defAudio = audioTracks[defaultAudioIdx];
          if (defAudio.audioTrackId) {
            detectedAudioLang = defAudio.audioTrackId.split('.')[0].split('-')[0].toLowerCase();
          }
          if (Array.isArray(defAudio.captionTrackIndices) && defAudio.captionTrackIndices.length > 0) {
            primaryCaptionIdxFromAudio = defAudio.captionTrackIndices[0];
          }
        }
      }
    } catch (itErr) {
      console.warn("InnerTube fetch notice:", itErr);
    }

    // 2. FALLBACK ENGINE: Web InnerTube specification if Android tracks empty
    if (!captionTracks.length) {
      try {
        const webRes = await fetch(INNERTUBE_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Referer': `https://www.youtube.com/watch?v=${videoId}`
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20240313.01.00',
                originalUrl: `https://www.youtube.com/watch?v=${videoId}`
              }
            },
            videoId
          })
        });

        if (webRes.ok) {
          const webData: any = await webRes.json();
          const renderer = webData?.captions?.playerCaptionsTracklistRenderer;
          const webTracks = renderer?.captionTracks;
          if (Array.isArray(webTracks) && webTracks.length > 0) {
            captionTracks = webTracks;
            if (!itData) itData = webData;
            const audioTracks = renderer?.audioTracks;
            const defaultAudioIdx = renderer?.defaultAudioTrackIndex ?? 0;
            if (Array.isArray(audioTracks) && audioTracks[defaultAudioIdx]) {
              const defAudio = audioTracks[defaultAudioIdx];
              if (defAudio.audioTrackId) {
                detectedAudioLang = defAudio.audioTrackId.split('.')[0].split('-')[0].toLowerCase();
              }
            }
          }
        }
      } catch (webErr) {
        console.warn("Web InnerTube fallback notice:", webErr);
      }
    }

    if (!captionTracks.length) {
      return new Response(JSON.stringify({
        ok: false,
        error: "No captions available for this video on YouTube.",
        videoId,
        title: videoTitle,
        debug: {
          itStatus: itData?.playabilityStatus?.status,
          itReason: itData?.playabilityStatus?.reason,
          watchStatus,
          watchHtmlLen,
          watchHasCaptions,
          watchParsedCount
        },
        subtitles: []
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 3. SELECT TRACK STRICTLY IN THE ORIGINAL SPOKEN LANGUAGE
    let selectedTrack: any = null;

    // A. Explicit language requested (e.g. ?lang=fr or ?lang=en)
    if (requestedLang) {
      selectedTrack = captionTracks.find((t: any) => t.languageCode?.toLowerCase().startsWith(requestedLang) && t.kind !== 'asr')
                   || captionTracks.find((t: any) => t.languageCode?.toLowerCase().startsWith(requestedLang));
    }

    // B. Prioritize track linked directly to original audioTrack in InnerTube
    if (!selectedTrack && primaryCaptionIdxFromAudio !== null && captionTracks[primaryCaptionIdxFromAudio]) {
      selectedTrack = captionTracks[primaryCaptionIdxFromAudio];
    }

    // C. Detect original spoken audio language from audioTrackId
    if (!selectedTrack && detectedAudioLang) {
      const manualTrack = captionTracks.find((t: any) => t.languageCode?.toLowerCase().startsWith(detectedAudioLang) && t.kind !== 'asr');
      const asrTrack = captionTracks.find((t: any) => t.languageCode?.toLowerCase().startsWith(detectedAudioLang));
      selectedTrack = manualTrack || asrTrack;
    }

    // D. Detect language from video title
    if (!selectedTrack && videoTitle) {
      const isArabic = /[\u0600-\u06FF\u0750-\u077F]/.test(videoTitle);
      const isFrench = /[éèêëàâôûùçîïœæ]|\b(pourquoi|comment|quand|dans|avec|pour|sens|mal|sans|raison|le|la|les|un|une|des|du|qui|que)\b/i.test(videoTitle);
      const isSpanish = /[áéíóúüñ¿¡]|\b(por qué|como|cuando|en|con|para|el|la|los|las|un|una|del)\b/i.test(videoTitle);
      const isGerman = /[äöüß]|\b(warum|wie|wenn|in|mit|für|der|die|das|ein|eine|des|dem|den)\b/i.test(videoTitle);

      const titleLang = isArabic ? 'ar' : isFrench ? 'fr' : isSpanish ? 'es' : isGerman ? 'de' : null;
      if (titleLang) {
        selectedTrack = captionTracks.find((t: any) => t.languageCode?.toLowerCase().startsWith(titleLang) && t.kind !== 'asr')
                     || captionTracks.find((t: any) => t.languageCode?.toLowerCase().startsWith(titleLang));
      }
    }

    // E. Fallback: authentic original track (avoiding auto-translations)
    if (!selectedTrack) {
      const authenticTracks = captionTracks.filter((t: any) => !t.vssId?.startsWith('t.'));
      const defaultTrack = authenticTracks.find((t: any) => t.isDefault && t.kind !== 'asr')
                         || authenticTracks.find((t: any) => t.isDefault)
                         || authenticTracks[0];
      selectedTrack = defaultTrack || captionTracks[0];
    }

    const detectedLang = selectedTrack.languageCode || 'en';

    // 4. FETCH TIMEDTEXT XML
    let trackUrl = selectedTrack.baseUrl;
    let srv3Url = trackUrl.includes('fmt=') ? trackUrl : `${trackUrl}&fmt=srv3`;

    let xml = '';

    // Attempt 1: Fetch with exact Kakulukian USER_AGENT
    try {
      const aRes = await fetch(trackUrl, {
        headers: {
          'User-Agent': INNERTUBE_USER_AGENT,
          'Accept-Language': requestedLang || detectedLang
        }
      });
      if (aRes.ok) {
        const text = await aRes.text();
        if (text && text.trim().startsWith('<') && !text.includes('GoogleSorry')) {
          xml = text;
        }
      }
    } catch (_) {}

    // Attempt 2: Fetch srv3Url with Android headers
    if (!xml) {
      try {
        const bRes = await fetch(srv3Url, {
          headers: {
            'User-Agent': INNERTUBE_USER_AGENT,
            'Accept': '*/*'
          }
        });
        if (bRes.ok) {
          const text = await bRes.text();
          if (text && text.trim().startsWith('<') && !text.includes('GoogleSorry')) {
            xml = text;
          }
        }
      } catch (_) {}
    }

    // Attempt 3: Direct trackUrl without srv3
    if (!xml) {
      try {
        const cRes = await fetch(trackUrl);
        if (cRes.ok) {
          const text = await cRes.text();
          if (text && text.trim().startsWith('<') && !text.includes('GoogleSorry')) {
            xml = text;
          }
        }
      } catch (_) {}
    }

    if (!xml || xml.includes('GoogleSorry')) {
      return new Response(JSON.stringify({
        ok: false,
        error: "Subtitles stream could not be loaded from YouTube timedtext.",
        videoId,
        title: videoTitle,
        language: detectedLang,
        subtitles: []
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    const subtitles = parseTranscriptXml(xml);

    const response = new Response(JSON.stringify({
      ok: true,
      videoId,
      title: videoTitle,
      language: detectedLang,
      trackKind: selectedTrack.kind || 'standard',
      subtitles
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=604800, s-maxage=604800'
      }
    });

    // Cache permanently at Cloudflare Edge
    if (cache && cacheKey && context.waitUntil) {
      try {
        context.waitUntil(cache.put(cacheKey, response.clone()));
      } catch (_) {}
    }

    return response;

  } catch (err: any) {
    return new Response(JSON.stringify({
      ok: false,
      error: err.message || "Failed to fetch native YouTube captions.",
      videoId,
      title: videoTitle,
      subtitles: []
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  }
};

export const onRequest = onRequestGet;
