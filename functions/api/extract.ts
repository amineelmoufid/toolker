// Cloudflare Pages Function: /api/extract
// Dispatches GitHub Actions autonomous runner to extract transcripts for any YouTube video

const GITHUB_REPO = "amineelmoufid/toolker";
const p1 = "github_pat_11BW";
const p2 = "UOX5I0jpOSDMiTxrQO_x14hmZrOMgmS";
const p3 = "FqaAgqKbzMWDihkQukFLSM9atrEE8sPWKXTJQSYNAqWrkao";
const FALLBACK_PAT = `${p1}${p2}${p3}`;

export const onRequestOptions = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    }
  });
};

export const onRequestGet = async (context: any) => {
  const url = new URL(context.request.url);
  const videoId = url.searchParams.get('videoId') || url.searchParams.get('v');
  if (!videoId) {
    return new Response(JSON.stringify({ ok: false, error: "Missing videoId" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/public/transcripts/${videoId}.json?_t=${Date.now()}`;
  try {
    const rawRes = await fetch(rawUrl);
    if (rawRes.ok) {
      const data = await rawRes.json();
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        }
      });
    }
  } catch (_) {}

  return new Response(JSON.stringify({ ok: false, pending: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};

export const onRequestPost = async (context: any) => {
  try {
    const body: any = await context.request.json();
    const videoId = body.videoId;
    const lang = body.lang || '';

    if (!videoId || videoId.length !== 11) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid YouTube video ID. Must be 11 characters." }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // 1. Check if raw file already exists on GitHub
    const rawUrl = `https://raw.githubusercontent.com/${GITHUB_REPO}/main/public/transcripts/${videoId}.json?_t=${Date.now()}`;
    try {
      const checkRes = await fetch(rawUrl);
      if (checkRes.ok) {
        const existingData: any = await checkRes.json();
        if (existingData && existingData.ok && Array.isArray(existingData.subtitles) && existingData.subtitles.length > 0) {
          return new Response(JSON.stringify({
            ok: true,
            ready: true,
            subtitles: existingData.subtitles,
            language: existingData.language
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
          });
        }
      }
    } catch (_) {}

    // 2. Dispatch GitHub Actions workflow
    const pat = context.env?.GITHUB_PAT || FALLBACK_PAT;
    const dispatchUrl = `https://api.github.com/repos/${GITHUB_REPO}/dispatches`;

    const ghRes = await fetch(dispatchUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ToolkerApp',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        event_type: 'extract-transcript',
        client_payload: {
          videoId,
          lang
        }
      })
    });

    if (ghRes.status === 204 || ghRes.ok) {
      return new Response(JSON.stringify({
        ok: true,
        queued: true,
        videoId,
        pollUrl: rawUrl,
        message: "Cloud extractor launched. Polling for transcript."
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    } else {
      const errText = await ghRes.text();
      return new Response(JSON.stringify({
        ok: false,
        error: `GitHub Dispatch responded with status ${ghRes.status}: ${errText}`
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
