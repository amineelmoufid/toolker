// Cloudflare Pages Function: /api/cache
// Crowdsourced Edge Caching for Subtitles

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
  const videoId = url.searchParams.get('v') || url.searchParams.get('videoId');

  if (!videoId || videoId.length !== 11) {
    return new Response(JSON.stringify({ ok: false, error: "Invalid videoId" }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }

  // Check Cloudflare Cache
  try {
    if (typeof caches !== 'undefined' && (caches as any).default) {
      const cache = (caches as any).default;
      const cacheKey = new Request(new URL(`/api/cache?v=${videoId}`, context.request.url).toString());
      const hit = await cache.match(cacheKey);
      if (hit) {
        return hit;
      }
    }
  } catch (_) {}

  // Check GitHub raw CDN
  try {
    const ghUrl = `https://raw.githubusercontent.com/amineelmoufid/toolker/main/public/transcripts/${videoId}.json`;
    const ghRes = await fetch(ghUrl);
    if (ghRes.ok) {
      const data: any = await ghRes.json();
      if (data && data.subtitles) {
        return new Response(JSON.stringify(data), {
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

  return new Response(JSON.stringify({ ok: false, error: "Not cached yet" }), {
    status: 404,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });
};

export const onRequestPost = async (context: any) => {
  try {
    const body: any = await context.request.json();
    const { videoId, title, subtitles } = body;

    if (!videoId || !Array.isArray(subtitles) || subtitles.length === 0) {
      return new Response(JSON.stringify({ ok: false, error: "Invalid payload" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    const payload = {
      ok: true,
      videoId,
      title: title || `YouTube Video (${videoId})`,
      subtitles,
      source: "crowdsourced_edge_cache",
      cachedAt: new Date().toISOString()
    };

    const res = new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=31536000, s-maxage=31536000'
      }
    });

    // Store in Cloudflare Cache API
    try {
      if (typeof caches !== 'undefined' && (caches as any).default) {
        const cache = (caches as any).default;
        const cacheKey = new Request(new URL(`/api/cache?v=${videoId}`, context.request.url).toString());
        await cache.put(cacheKey, res.clone());
      }
    } catch (_) {}

    return res;
  } catch (err: any) {
    return new Response(JSON.stringify({ ok: false, error: err.message || "Failed to cache" }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
};
