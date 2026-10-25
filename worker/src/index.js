export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    url.hostname = "toolker.pages.dev";
    url.protocol = "https:";
    
    const headers = new Headers(request.headers);
    headers.set("Host", "toolker.pages.dev");
    headers.set("X-Forwarded-Host", request.headers.get("Host") || "toolker.stratom.bond");
    headers.set("X-Forwarded-Proto", "https");

    const forwardRequest = new Request(url.toString(), {
      method: request.method,
      headers: headers,
      body: (request.method !== 'GET' && request.method !== 'HEAD') ? request.body : undefined,
      redirect: "follow",
    });

    const response = await fetch(forwardRequest);
    if (response.status === 404 && !url.pathname.includes('.')) {
      url.pathname = '/index.html';
      const fallbackRequest = new Request(url.toString(), {
        method: 'GET',
        headers: headers,
      });
      return fetch(fallbackRequest);
    }
    return response;
  },
};

