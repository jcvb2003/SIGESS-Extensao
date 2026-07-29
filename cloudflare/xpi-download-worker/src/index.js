const UPSTREAM_XPI_URL =
  "https://github.com/jcvb2003/SIGESS-Extensao/releases/latest/download/sigess.xpi";

const DOWNLOAD_PATH = "/sigess.xpi";
const CACHE_SECONDS = 300;

const FORWARDED_REQUEST_HEADERS = [
  "if-modified-since",
  "if-none-match",
  "range",
];

const FORWARDED_RESPONSE_HEADERS = [
  "accept-ranges",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
];

function jsonResponse(payload, status, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
  });
}

function methodNotAllowed() {
  return jsonResponse({ error: "method_not_allowed" }, 405, {
    Allow: "GET, HEAD",
  });
}

function buildDownloadHeaders(upstreamHeaders) {
  const headers = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamHeaders.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  headers.set("Content-Type", "application/x-xpinstall");
  headers.set("Content-Disposition", 'inline; filename="sigess.xpi"');
  headers.set(
    "Cache-Control",
    `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}, stale-if-error=86400`,
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");

  return headers;
}

async function proxyXpi(request) {
  const upstreamHeaders = new Headers({
    Accept:
      "application/x-xpinstall, application/octet-stream;q=0.9, */*;q=0.8",
    "User-Agent": "SIGESS-XPI-Proxy/1.0",
  });

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      upstreamHeaders.set(name, value);
    }
  }

  const upstreamResponse = await fetch(UPSTREAM_XPI_URL, {
    method: request.method,
    headers: upstreamHeaders,
    redirect: "follow",
    cf: {
      cacheEverything: true,
      cacheTtl: CACHE_SECONDS,
    },
  });

  if (!upstreamResponse.ok && upstreamResponse.status !== 304) {
    console.error(
      JSON.stringify({
        event: "xpi_upstream_error",
        status: upstreamResponse.status,
      }),
    );

    return jsonResponse({ error: "download_temporarily_unavailable" }, 502);
  }

  return new Response(
    request.method === "HEAD" ? null : upstreamResponse.body,
    {
      status: upstreamResponse.status,
      headers: buildDownloadHeaders(upstreamResponse.headers),
    },
  );
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return methodNotAllowed();
      }

      return jsonResponse({ status: "ok" }, 200);
    }

    if (url.pathname === "/") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return methodNotAllowed();
      }

      return Response.redirect(new URL(DOWNLOAD_PATH, url), 307);
    }

    if (url.pathname !== DOWNLOAD_PATH) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed();
    }

    try {
      return await proxyXpi(request);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "xpi_proxy_exception",
          message: error instanceof Error ? error.message : "unknown_error",
        }),
      );

      return jsonResponse({ error: "download_temporarily_unavailable" }, 502);
    }
  },
};
