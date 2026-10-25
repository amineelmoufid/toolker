/**
 * Cloudflare Pages Function: /api/tts
 * Edge serverless TTS proxy for authentic native French, Arabic, and English audio.
 * Supports arbitrary sentence lengths via parallel chunking and seamless MP3 frame concatenation.
 */

function chunkText(text, maxLen = 175) {
  if (text.length <= maxLen) return [text];

  const chunks = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLen) {
      chunks.push(remaining);
      break;
    }

    let slice = remaining.slice(0, maxLen);
    let splitIdx = -1;

    // Look for punctuation + space: comma, semicolon, colon, dash, Arabic comma (،), Arabic semicolon (؛)
    const punctMatch = slice.match(/.*([,;:\-–—\(\)\u060C\u061B])\s*/);
    if (punctMatch && punctMatch[0].length >= maxLen * 0.35) {
      splitIdx = punctMatch[0].length;
    } else {
      const lastSpace = slice.lastIndexOf(' ');
      if (lastSpace >= maxLen * 0.3) {
        splitIdx = lastSpace + 1;
      } else {
        splitIdx = maxLen;
      }
    }

    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }

  return chunks.filter(Boolean);
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const text = url.searchParams.get('text') || '';
  const lang = (url.searchParams.get('lang') || 'fr').toLowerCase();

  if (!text.trim()) {
    return new Response('Text parameter is required', { status: 400 });
  }

  const shortLang = lang.split('-')[0] || 'en';
  // Strip markdown asterisks, underscores, hashes, and backslashes
  const sanitized = text.replace(/[*_~`#\\]/g, ' ').replace(/\s+/g, ' ').trim();

  const chunks = chunkText(sanitized, 175);

  const fetchChunk = async (chunk) => {
    const upstreamUrl = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(shortLang)}&client=tw-ob&q=${encodeURIComponent(chunk)}`;
    const response = await fetch(upstreamUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
        'Accept': 'audio/mpeg, audio/*; q=0.9, */*; q=0.1'
      }
    });

    if (!response.ok) {
      throw new Error(`Upstream speech service returned ${response.status}`);
    }

    return response.arrayBuffer();
  };

  try {
    if (chunks.length === 1) {
      const buffer = await fetchChunk(chunks[0]);
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'audio/mpeg',
          'Cache-Control': 'public, max-age=86400, s-maxage=86400',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // Parallel fetch for all chunks
    const buffers = await Promise.all(chunks.map(chunk => fetchChunk(chunk)));

    // Concatenate MP3 frames into a single continuous audio stream
    const totalLength = buffers.reduce((acc, b) => acc + b.byteLength, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (const buf of buffers) {
      combined.set(new Uint8Array(buf), offset);
      offset += buf.byteLength;
    }

    return new Response(combined, {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    return new Response(`TTS Error: ${error.message}`, { 
      status: 500,
      headers: { 'Access-Control-Allow-Origin': '*' }
    });
  }
}
