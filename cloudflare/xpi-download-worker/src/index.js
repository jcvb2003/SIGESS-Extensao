const UPSTREAM_XPI_URL =
  "https://github.com/jcvb2003/SIGESS-Extensao/releases/latest/download/sigess.xpi";

const INSTALL_PATH = "/instalar";
const DOWNLOAD_PATH = "/sigess.xpi";
const CACHE_SECONDS = 300;
const REDIRECT_DELAY_SECONDS = 3;

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

function installPageResponse(request) {
  const downloadUrl = new URL(DOWNLOAD_PATH, request.url).toString();
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="${REDIRECT_DELAY_SECONDS};url=${downloadUrl}">
  <title>Atualizar extensão SIGESS</title>
  <style>
    :root { color-scheme: light; font-family: "Segoe UI", system-ui, sans-serif; }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; background: #f4f7f7; color: #253238; }
    main { width: min(520px, 100%); padding: 36px; border: 1px solid #d5dede; background: #fff; box-shadow: 0 18px 50px rgba(35, 55, 60, .1); }
    .label { margin: 0 0 12px; color: #176b68; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
    h1 { margin: 0; font-size: 25px; line-height: 1.25; }
    p { margin: 16px 0 0; color: #5d6a70; line-height: 1.6; }
    strong { color: #253238; }
    a { display: inline-flex; justify-content: center; width: 100%; min-height: 44px; margin-top: 26px; padding: 12px 18px; background: #176b68; color: #fff; font-weight: 700; text-decoration: none; }
    a:hover, a:focus-visible { background: #0d514f; }
  </style>
</head>
<body>
  <main>
    <p class="label">Atualização segura</p>
    <h1>Preparando a extensão SIGESS</h1>
    <p>O download começará automaticamente em <strong id="countdown">${REDIRECT_DELAY_SECONDS}</strong> segundos.</p>
    <p>Se o Firefox não continuar automaticamente, use o botão abaixo.</p>
    <a href="${downloadUrl}">Baixar extensão agora</a>
  </main>
  <script>
    let remaining = ${REDIRECT_DELAY_SECONDS};
    const countdown = document.getElementById("countdown");
    const timer = setInterval(() => {
      remaining -= 1;
      countdown.textContent = String(Math.max(remaining, 0));
      if (remaining <= 0) {
        clearInterval(timer);
        window.location.assign(${JSON.stringify(downloadUrl)});
      }
    }, 1000);
  </script>
</body>
</html>`;

  return new Response(request.method === "HEAD" ? null : html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      "X-Frame-Options": "DENY",
    },
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

      return Response.redirect(new URL(INSTALL_PATH, url), 307);
    }

    if (url.pathname === INSTALL_PATH) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return methodNotAllowed();
      }

      return installPageResponse(request);
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
