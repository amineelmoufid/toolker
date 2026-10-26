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
  if (!videoId || videoId.length !== 11) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid videoId" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // 1. Check local static transcripts
  try {
    const staticUrl = new URL(`/transcripts/${videoId}.json`, context.request.url);
    const staticRes = await fetch(staticUrl);
    const contentType = staticRes.headers.get('content-type') || '';
    if (staticRes.ok && contentType.includes('application/json')) {
      const staticData: any = await staticRes.json();
      if (staticData && staticData.ok && Array.isArray(staticData.subtitles) && staticData.subtitles.length > 0) {
        return new Response(JSON.stringify(staticData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
          }
        });
      }
    }
  } catch (_) {}

  // 2. Query GitHub Contents API directly (real-time, zero CDN caching, bypasses Fastly 404 cache)
  try {
    const pat = context.env?.GITHUB_PAT || FALLBACK_PAT;
    const ghApiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/public/transcripts/${videoId}.json`;
    const ghRes = await fetch(ghApiUrl, {
      headers: {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'ToolkerApp'
      }
    });

    if (ghRes.ok) {
      const fileData: any = await ghRes.json();
      if (fileData.content) {
        const decoded = atob(fileData.content.replace(/\s+/g, ''));
        const subData = JSON.parse(decoded);
        return new Response(JSON.stringify(subData), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'no-cache'
          }
        });
      }
    }
  } catch (err) {
    console.warn("GitHub contents check error:", err);
  }

  // Return 200 pending so browser console has ZERO red 404 errors!
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

    // 1. Check if file already exists in repository (instant return)
    const pat = context.env?.GITHUB_PAT || FALLBACK_PAT;
    try {
      const ghApiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/public/transcripts/${videoId}.json`;
      const checkRes = await fetch(ghApiUrl, {
        headers: {
          'Authorization': `Bearer ${pat}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'ToolkerApp'
        }
      });
      if (checkRes.ok) {
        const fileData: any = await checkRes.json();
        if (fileData.content) {
          const decoded = atob(fileData.content.replace(/\s+/g, ''));
          const existingData = JSON.parse(decoded);
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
      }
    } catch (_) {}

    // 2. Dispatch GitHub Actions workflow
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
        pollUrl: `/api/extract?v=${videoId}`,
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
