// Toolker Subtitle Companion - Background Service Worker
// Extracts authentic YouTube subtitle XML directly using the user's residential browser session (0 CORS, 0 Datacenter blocks)

function extractCaptionTracksFromHtml(html) {
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
          return JSON.parse(jsonStr);
        } catch (_) {
          return null;
        }
      }
    }
  }
  return null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOOLKER_FETCH_SUBTITLES') {
    const videoId = request.videoId;
    if (!videoId || videoId.length !== 11) {
      sendResponse({ ok: false, error: 'Invalid videoId' });
      return true;
    }

    (async () => {
      try {
        // 1. Fetch YouTube watch page using the browser's residential connection
        const watchRes = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
          headers: {
            'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8'
          }
        });

        if (!watchRes.ok) {
          throw new Error(`YouTube watch page returned status ${watchRes.status}`);
        }

        const html = await watchRes.text();
        let captionTracks = extractCaptionTracksFromHtml(html);

        if (!captionTracks || captionTracks.length === 0) {
          // Fallback to Native Android InnerTube with Official Key in residential session
          try {
            const itRes = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'com.google.android.youtube/20.10.38 (Linux; U; Android 14)'
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
              const itData = await itRes.json();
              captionTracks = itData?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
            }
          } catch (_) {}
        }

        if (!captionTracks || captionTracks.length === 0) {
          sendResponse({ ok: false, error: 'No subtitles found on YouTube for this video.' });
          return;
        }

        // 2. Select best authentic track in original spoken language
        const authenticTracks = captionTracks.filter(t => !t.vssId || !t.vssId.startsWith('t.'));
        const selectedTrack = authenticTracks.find(t => t.isDefault && t.kind !== 'asr') ||
                              authenticTracks.find(t => t.isDefault) ||
                              authenticTracks.find(t => t.kind !== 'asr') ||
                              captionTracks.find(t => t.kind === 'asr') ||
                              captionTracks[0];

        let trackUrl = selectedTrack.baseUrl;
        if (!trackUrl.includes('fmt=')) {
          trackUrl += '&fmt=srv3';
        }

        // 3. Fetch timedtext XML directly
        const xmlRes = await fetch(trackUrl);
        if (!xmlRes.ok) {
          throw new Error(`Timedtext XML returned status ${xmlRes.status}`);
        }

        const xmlText = await xmlRes.text();

        sendResponse({
          ok: true,
          videoId,
          lang: selectedTrack.languageCode || 'en',
          xml: xmlText,
          track: selectedTrack
        });
      } catch (err) {
        sendResponse({ ok: false, error: err.message || 'Extraction failed' });
      }
    })();

    return true; // Keep message channel open for async response
  }
});
