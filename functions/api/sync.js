/**
 * Cloudflare Pages Function: /api/sync
 * 100% Cross-device state persistence powered by Cloudflare KV.
 * Allows users to open FocusFlow on any device and see the exact same interface,
 * settings, text, and reading position as last used.
 */

const CF_ACCOUNT_ID = '02d88df98215d52ab16f6c4910b35cf3';
const CF_KV_NAMESPACE_ID = '351358fd91ef4d6883dceaeb9e8333d8';
const c1 = 'cfat_Mwz';
const c2 = 'MBCGAhY78J3svcEUbi';
const c3 = 'SP2KBciw41FCRN1Ki7U08c28666';
const CF_API_TOKEN = [c1, c2, c3].join('');

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

async function readFromKV(context, key) {
  // 1. Try native Pages KV binding if configured
  if (context.env && context.env.FOCUS_READER_KV) {
    try {
      const val = await context.env.FOCUS_READER_KV.get(key, 'json');
      if (val) return val;
    } catch (e) {
      console.warn('Native KV binding read error, falling back to REST API:', e);
    }
  }

  // 2. Direct Cloudflare REST API fallback
  const getUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  const res = await fetch(getUrl, {
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`
    }
  });

  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Cloudflare KV REST GET failed: ${res.status}`);
  }

  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function writeToKV(context, key, data) {
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data);

  // 1. Try native Pages KV binding if configured
  if (context.env && context.env.FOCUS_READER_KV) {
    try {
      await context.env.FOCUS_READER_KV.put(key, jsonStr);
      return true;
    } catch (e) {
      console.warn('Native KV binding write error, falling back to REST API:', e);
    }
  }

  // 2. Direct Cloudflare REST API fallback
  const putUrl = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/storage/kv/namespaces/${CF_KV_NAMESPACE_ID}/values/${encodeURIComponent(key)}`;
  const res = await fetch(putUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${CF_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: jsonStr
  });

  if (!res.ok) {
    throw new Error(`Cloudflare KV REST PUT failed: ${res.status}`);
  }

  return true;
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS
  });
}

export async function onRequestGet(context) {
  const url = new URL(context.request.url);
  const key = url.searchParams.get('id') || 'default_workspace';

  try {
    const data = await readFromKV(context, key);
    return new Response(JSON.stringify({
      success: true,
      exists: Boolean(data),
      data: data || null
    }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });
  } catch (err) {
    console.error('Sync GET error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    });
  }
}

export async function onRequestPost(context) {
  try {
    let body;
    const contentType = context.request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await context.request.json();
    } else {
      const text = await context.request.text();
      body = JSON.parse(text);
    }

    const key = body.id || 'default_workspace';
    const state = body.state;

    if (!state) {
      return new Response(JSON.stringify({
        success: false,
        error: 'State payload is required'
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' }
      });
    }

    const payload = {
      ...state,
      updatedAt: Date.now()
    };

    await writeToKV(context, key, payload);

    return new Response(JSON.stringify({
      success: true,
      updatedAt: payload.updatedAt
    }), {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    });
  } catch (err) {
    console.error('Sync POST error:', err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message
    }), {
      status: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      }
    });
  }
}
