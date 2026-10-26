// Toolker Subtitle Companion - Content Script
// Bridges Toolker web application with the browser extension for 100% residential subtitle extraction

// Announce presence to Toolker web app
function announceReady() {
  window.postMessage({
    type: 'TOOLKER_EXTENSION_READY',
    version: '1.0.0',
    capabilities: ['direct_youtube_extraction', 'residential_ip']
  }, '*');
}

// Announce on load and periodically for dynamic SPAs
announceReady();
setInterval(announceReady, 2000);

// Listen for requests from Toolker web app
window.addEventListener('message', (event) => {
  // Only accept messages from same window
  if (event.source !== window) return;

  const data = event.data;
  if (data && data.type === 'TOOLKER_REQ_SUBTITLES') {
    const { videoId, requestId } = data;

    chrome.runtime.sendMessage(
      { type: 'TOOLKER_FETCH_SUBTITLES', videoId },
      (response) => {
        window.postMessage({
          type: 'TOOLKER_RES_SUBTITLES',
          requestId,
          ...(response || { ok: false, error: 'Extension failed to respond' })
        }, '*');
      }
    );
  }
});
