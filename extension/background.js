// Toolker Subtitle Companion - Background Service Worker
// Extracts authentic YouTube subtitle XML directly using the user's residential browser session (0 CORS, 0 Datacenter blocks)

const EXTENSION_VERSION = '1.0.3';
const OFFICIAL_KEY = ['AIza', 'SyAO', '_FJ2SlqU', '8Q4STEHL', 'GCilw_Y9', '_11qcW8'].join('');

function decodeEntities(text) {
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

async function extractYouTubeSubtitles(videoId, requestedLang) {
  let captionTracks = [];
  let itData = null;

  // 1. PRIMARY BULLETPROOF ENGINE: Android InnerTube with Official Key in residential session
  try {
    const itUrl = `https://www.youtube.com/youtubei/v1/player?key=${OFFICIAL_KEY}`;
    const itRes = await fetch(itUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        context: {
          client: {
            clientName: 'ANDROID',
            clientVersion: '20.10.38'
          }
        },
        videoId
      })
    });

    if (itRes.ok) {
      itData = await itRes.json();
      const tracks = itData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        captionTracks = tracks;
      }
    }
  } catch (err) {
    console.warn('[Toolker Companion] Android InnerTube notice:', err);
  }

  // 2. FALLBACK ENGINE: Extract dynamic INNERTUBE_API_KEY from watch page
  if (captionTracks.length === 0) {
    try {
      const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
        headers: {
          'Accept-Language': requestedLang || 'en-US,en;q=0.9,fr;q=0.8'
        }
      });
      if (watchRes.ok) {
        const html = await watchRes.text();
        const keyMatch = html.match(/"INNERTUBE_API_KEY":\s*"([a-zA-Z0-9_-]+)"/);
        if (keyMatch && keyMatch[1]) {
          const dynamicKey = keyMatch[1];
          const dynRes = await fetch(`https://www.youtube.com/youtubei/v1/player?key=${dynamicKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              context: {
                client: {
                  clientName: 'ANDROID',
                  clientVersion: '20.10.38'
                }
              },
              videoId
            })
          });
          if (dynRes.ok) {
            const dynData = await dynRes.json();
            const tracks = dynData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            if (Array.isArray(tracks) && tracks.length > 0) {
              captionTracks = tracks;
              if (!itData) itData = dynData;
            }
          }
        }
      }
    } catch (watchErr) {
      console.warn('[Toolker Companion] Watch page fallback notice:', watchErr);
    }
  }

  if (captionTracks.length === 0) {
    throw new Error('No caption tracks found on YouTube for this video');
  }

  // 3. Select track: prefer requestedLang, then original language / manual track over ASR
  const authenticTracks = captionTracks.filter(t => !t.vssId || !t.vssId.startsWith('t.'));
  let selectedTrack = null;

  if (requestedLang) {
    selectedTrack = authenticTracks.find(t => t.languageCode?.toLowerCase().startsWith(requestedLang.toLowerCase())) ||
                    captionTracks.find(t => t.languageCode?.toLowerCase().startsWith(requestedLang.toLowerCase()));
  }

  if (!selectedTrack) {
    selectedTrack = authenticTracks.find(t => t.languageCode === 'en' && t.kind !== 'asr') ||
                    authenticTracks.find(t => t.languageCode === 'en') ||
                    authenticTracks.find(t => t.isDefault && t.kind !== 'asr') ||
                    authenticTracks.find(t => t.isDefault) ||
                    authenticTracks.find(t => t.kind !== 'asr') ||
                    captionTracks.find(t => t.languageCode === 'en') ||
                    captionTracks[0];
  }

  let trackUrl = selectedTrack.baseUrl;
  let srv3Url = trackUrl.includes('fmt=') ? trackUrl : `${trackUrl}&fmt=srv3`;

  // 4. Fetch timedtext XML directly using residential session
  let xmlText = '';
  try {
    const xmlRes = await fetch(srv3Url);
    if (xmlRes.ok) {
      xmlText = await xmlRes.text();
    }
  } catch (_) {}

  // Fallback to baseUrl without &fmt=srv3 if empty
  if (!xmlText || xmlText.length < 50) {
    try {
      const rawRes = await fetch(trackUrl);
      if (rawRes.ok) {
        xmlText = await rawRes.text();
      }
    } catch (_) {}
  }

  if (!xmlText || xmlText.length < 50) {
    throw new Error('Timedtext XML returned empty response');
  }

  return {
    ok: true,
    videoId,
    version: EXTENSION_VERSION,
    lang: selectedTrack.languageCode || 'en',
    xml: xmlText,
    track: selectedTrack
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOOLKER_FETCH_SUBTITLES') {
    const videoId = request.videoId;
    const lang = request.lang;
    if (!videoId || videoId.length !== 11) {
      sendResponse({ ok: false, error: 'Invalid videoId' });
      return true;
    }

    extractYouTubeSubtitles(videoId, lang)
      .then((result) => {
        sendResponse(result);
      })
      .catch((err) => {
        console.error('[Toolker Companion] Extraction error:', err);
        sendResponse({ ok: false, error: err.message || 'Extraction failed' });
      });

    return true; // Keep message channel open for async response
  }
});
