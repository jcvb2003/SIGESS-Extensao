const LATEST_XPI_URL =
  "https://github.com/jcvb2003/SIGESS-Extensao/releases/latest/download/sigess.xpi";
const UPDATES_URL =
  "https://raw.githubusercontent.com/jcvb2003/SIGESS-Extensao/main/updates.json";

const DOWNLOAD_PATH = "/sigess.xpi";
const UPDATES_PATH = "/updates.json";
const VERSIONED_DOWNLOAD_PATTERN =
  /^\/releases\/v(\d+\.\d+\.\d+)\/sigess\.xpi$/;
const LATEST_CACHE_SECONDS = 300;
const VERSIONED_CACHE_SECONDS = 31536000;

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

function resolveResource(pathname) {
  if (pathname === DOWNLOAD_PATH) {
    return {
      kind: "xpi",
      upstreamUrl: LATEST_XPI_URL,
      cacheSeconds: LATEST_CACHE_SECONDS,
      immutable: false,
    };
  }

  if (pathname === UPDATES_PATH) {
    return {
      kind: "updates",
      upstreamUrl: UPDATES_URL,
      cacheSeconds: LATEST_CACHE_SECONDS,
      immutable: false,
    };
  }

  const versionMatch = pathname.match(VERSIONED_DOWNLOAD_PATTERN);
  if (!versionMatch) {
    return null;
  }

  const version = versionMatch[1];
  return {
    kind: "xpi",
    upstreamUrl:
      `https://github.com/jcvb2003/SIGESS-Extensao/releases/download/` +
      `v${version}/sigess.xpi`,
    cacheSeconds: VERSIONED_CACHE_SECONDS,
    immutable: true,
  };
}

function buildProxyHeaders(upstreamHeaders, resource) {
  const headers = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const isXpiOnlyHeader = [
      "accept-ranges",
      "content-length",
      "content-range",
    ].includes(name);
    if (resource.kind !== "xpi" && isXpiOnlyHeader) {
      continue;
    }

    const value = upstreamHeaders.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  if (resource.kind === "xpi") {
    headers.set("Content-Type", "application/x-xpinstall");
    headers.set("Content-Disposition", 'inline; filename="sigess.xpi"');
  } else {
    headers.set("Content-Type", "application/json; charset=utf-8");
  }

  headers.set(
    "Cache-Control",
    `public, max-age=${resource.cacheSeconds}, ` +
      `s-maxage=${resource.cacheSeconds}, stale-if-error=86400` +
      (resource.immutable ? ", immutable" : ""),
  );
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "no-referrer");

  return headers;
}

async function proxyResource(request, resource) {
  const upstreamHeaders = new Headers({
    Accept:
      resource.kind === "xpi"
        ? "application/x-xpinstall, application/octet-stream;q=0.9, */*;q=0.8"
        : "application/json",
    "User-Agent": "SIGESS-XPI-Proxy/1.0",
  });

  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      upstreamHeaders.set(name, value);
    }
  }

  const upstreamResponse = await fetch(resource.upstreamUrl, {
    method: request.method,
    headers: upstreamHeaders,
    redirect: "follow",
    cf: {
      cacheEverything: true,
      cacheTtl: resource.cacheSeconds,
    },
  });

  if (!upstreamResponse.ok && upstreamResponse.status !== 304) {
    console.error(
      JSON.stringify({
        event: "download_upstream_error",
        kind: resource.kind,
        status: upstreamResponse.status,
      }),
    );

    return jsonResponse({ error: "download_temporarily_unavailable" }, 502);
  }

  return new Response(
    request.method === "HEAD" ? null : upstreamResponse.body,
    {
      status: upstreamResponse.status,
      headers: buildProxyHeaders(upstreamResponse.headers, resource),
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

    const resource = resolveResource(url.pathname);
    if (!resource) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed();
    }

    try {
      return await proxyResource(request, resource);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "download_proxy_exception",
          message: error instanceof Error ? error.message : "unknown_error",
        }),
      );

      return jsonResponse({ error: "download_temporarily_unavailable" }, 502);
    }
  },
};
