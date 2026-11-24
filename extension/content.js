// Toolker Subtitle Companion - Content Script
// Bridges Toolker web application with the browser extension for 100% residential subtitle extraction

function announceReady() {
  window.postMessage({
    type: 'TOOLKER_EXTENSION_READY',
    version: '1.0.2',
    capabilities: ['direct_youtube_extraction', 'residential_ip']
  }, '*');
}

announceReady();
setInterval(announceReady, 2000);

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const data = event.data;
  if (data && data.type === 'TOOLKER_REQ_SUBTITLES') {
    const { videoId, requestId } = data;
    console.log('[Toolker Companion] Content script received extraction request for:', videoId);

    chrome.runtime.sendMessage(
      { type: 'TOOLKER_FETCH_SUBTITLES', videoId },
      (response) => {
        const lastErr = chrome.runtime.lastError;
        if (lastErr) {
          console.warn('[Toolker Companion] Runtime message error:', lastErr);
        }
        window.postMessage({
          type: 'TOOLKER_RES_SUBTITLES',
          requestId,
          ...(response || { ok: false, error: lastErr?.message || 'Extension failed to respond' })
        }, '*');
      }
    );
  }
});
