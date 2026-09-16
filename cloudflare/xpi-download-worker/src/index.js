const GITHUB_API_BASE = "https://api.github.com/repos/jcvb2003/SIGESS-Extensao";
const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_TOKEN_NAME = "GITHUB_READ_TOKEN";
const FIREFOX_ADDON_ID = "{e9df396f-bdd8-4e79-bc7c-92017a928891}";
const UPDATES_API_URL = `${GITHUB_API_BASE}/contents/updates.json?ref=main`;
const LATEST_RELEASE_API_URL = `${GITHUB_API_BASE}/releases/latest`;
const GITHUB_ASSET_HOST_SUFFIX = ".githubusercontent.com";
const INSTALL_PATH = "/instalar";
const DOWNLOAD_PATH = "/sigess.xpi";
const UPDATES_PATH = "/updates.json";
const CACHE_SECONDS = 300;
const REDIRECT_DELAY_SECONDS = 3;
const RELEASE_VERSION_PATTERN =
  /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

const FORWARDED_REQUEST_HEADERS = ["range", "if-range"];

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

function reportUpstreamError(event, status) {
  console.error(JSON.stringify({ event, status }));
}

function unavailableResponse(
  status = 502,
  error = "source_temporarily_unavailable",
) {
  return jsonResponse({ error }, status);
}

function githubApiHeaders(token, accept) {
  return new Headers({
    Accept: accept,
    Authorization: `Bearer ${token}`,
    "User-Agent": "SIGESS-XPI-Proxy/2.0",
    "X-GitHub-Api-Version": GITHUB_API_VERSION,
  });
}

function assetEtag(asset) {
  if (
    typeof asset.digest === "string" &&
    /^sha256:[a-f0-9]{64}$/i.test(asset.digest)
  ) {
    return `"${asset.digest.replace(":", "-")}"`;
  }

  return `"github-release-asset-${asset.id}"`;
}

function isNotModified(request, asset, etag) {
  const ifNoneMatch = request.headers.get("if-none-match");
  if (ifNoneMatch) {
    return ifNoneMatch
      .split(",")
      .map((value) => value.trim().replace(/^W\//, ""))
      .some((value) => value === "*" || value === etag);
  }

  const ifModifiedSince = Date.parse(
    request.headers.get("if-modified-since") ?? "",
  );
  const updatedAt = Date.parse(asset.updated_at ?? "");
  return (
    Number.isFinite(ifModifiedSince) &&
    Number.isFinite(updatedAt) &&
    updatedAt <= ifModifiedSince + 999
  );
}

function buildDownloadHeaders(upstreamHeaders, asset, includeLength = false) {
  const headers = new Headers();

  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = upstreamHeaders.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  if (asset) {
    headers.set("ETag", assetEtag(asset));
    const lastModified = Date.parse(asset.updated_at ?? "");
    if (Number.isFinite(lastModified)) {
      headers.set("Last-Modified", new Date(lastModified).toUTCString());
    }
    if (includeLength && Number.isSafeInteger(asset.size) && asset.size >= 0) {
      headers.set("Content-Length", String(asset.size));
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

async function proxyUpdatesJson(request, env) {
  const token = env?.[GITHUB_TOKEN_NAME];
  if (!token) {
    return unavailableResponse(503, "update_source_not_configured");
  }

  const upstreamResponse = await fetch(UPDATES_API_URL, {
    method: "GET",
    headers: githubApiHeaders(token, "application/vnd.github.raw+json"),
    redirect: "manual",
    cf: {
      cacheEverything: true,
      cacheTtl: CACHE_SECONDS,
    },
  });

  if (!upstreamResponse.ok) {
    reportUpstreamError(
      "updates_manifest_upstream_error",
      upstreamResponse.status,
    );
    return unavailableResponse();
  }

  let manifest;
  try {
    manifest = await upstreamResponse.json();
  } catch {
    reportUpstreamError(
      "updates_manifest_invalid_json",
      upstreamResponse.status,
    );
    return unavailableResponse();
  }

  const updates = manifest?.addons?.[FIREFOX_ADDON_ID]?.updates;
  if (
    !Array.isArray(updates) ||
    updates.length === 0 ||
    typeof updates[0] !== "object"
  ) {
    reportUpstreamError(
      "updates_manifest_missing_addon",
      upstreamResponse.status,
    );
    return unavailableResponse();
  }

  const latestVersion = updates[0].version;
  if (
    typeof latestVersion !== "string" ||
    !RELEASE_VERSION_PATTERN.test(latestVersion)
  ) {
    reportUpstreamError(
      "updates_manifest_invalid_latest_version",
      upstreamResponse.status,
    );
    return unavailableResponse();
  }

  // Keep the repository's raw updates.json pointed at GitHub Releases for
  // existing installs. Only the Worker response switches clients to Cloudflare.
  const xpiUrl = new URL(DOWNLOAD_PATH, request.url);
  xpiUrl.searchParams.set("version", latestVersion);
  updates[0].update_link = xpiUrl.toString();

  const body = JSON.stringify(manifest);
  return new Response(request.method === "HEAD" ? null : body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}, s-maxage=${CACHE_SECONDS}`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

async function getLatestXpiAsset(token, version) {
  const releaseApiUrl = version
    ? `${GITHUB_API_BASE}/releases/tags/v${encodeURIComponent(version)}`
    : LATEST_RELEASE_API_URL;
  const response = await fetch(releaseApiUrl, {
    method: "GET",
    headers: githubApiHeaders(token, "application/vnd.github+json"),
    // Do not let the Worker runtime forward the private-repository token if
    // GitHub ever redirects this authenticated metadata request.
    redirect: "manual",
    cf: {
      cacheEverything: true,
      cacheTtl: CACHE_SECONDS,
    },
  });

  if (!response.ok) {
    reportUpstreamError("xpi_release_upstream_error", response.status);
    return null;
  }

  let release;
  try {
    release = await response.json();
  } catch {
    reportUpstreamError("xpi_release_invalid_json", response.status);
    return null;
  }

  const asset = release?.assets?.find(
    (candidate) =>
      candidate.name === "sigess.xpi" && candidate.state === "uploaded",
  );
  if (
    !asset ||
    !Number.isSafeInteger(asset.id) ||
    !Number.isSafeInteger(asset.size)
  ) {
    reportUpstreamError("xpi_release_asset_missing", response.status);
    return null;
  }

  return asset;
}

function buildAssetRequestHeaders(request, token) {
  const headers = githubApiHeaders(token, "application/octet-stream");
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

async function fetchAssetBody(request, asset, token) {
  const assetApiUrl = `${GITHUB_API_BASE}/releases/assets/${asset.id}`;
  const assetApiResponse = await fetch(assetApiUrl, {
    method: "GET",
    headers: buildAssetRequestHeaders(request, token),
    // GitHub returns a short-lived signed URL for private release assets.
    // Handle it explicitly so Authorization is never sent to that URL.
    redirect: "manual",
  });

  if (
    (assetApiResponse.status >= 200 && assetApiResponse.status < 300) ||
    assetApiResponse.status === 416
  ) {
    return assetApiResponse;
  }

  if (assetApiResponse.status < 300 || assetApiResponse.status >= 400) {
    reportUpstreamError("xpi_asset_upstream_error", assetApiResponse.status);
    return null;
  }

  const location = assetApiResponse.headers.get("Location");
  if (!location) {
    reportUpstreamError(
      "xpi_asset_redirect_missing_location",
      assetApiResponse.status,
    );
    return null;
  }

  let signedUrl;
  try {
    signedUrl = new URL(location);
  } catch {
    reportUpstreamError("xpi_asset_redirect_invalid", assetApiResponse.status);
    return null;
  }

  if (
    signedUrl.protocol !== "https:" ||
    signedUrl.username !== "" ||
    signedUrl.password !== "" ||
    signedUrl.port !== "" ||
    (signedUrl.hostname !== "githubusercontent.com" &&
      !signedUrl.hostname.endsWith(GITHUB_ASSET_HOST_SUFFIX))
  ) {
    reportUpstreamError(
      "xpi_asset_redirect_untrusted_host",
      assetApiResponse.status,
    );
    return null;
  }

  const cdnHeaders = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) {
      cdnHeaders.set(name, value);
    }
  }

  return fetch(signedUrl, {
    method: "GET",
    headers: cdnHeaders,
    redirect: "follow",
    cf: {
      cacheEverything: true,
      cacheTtl: CACHE_SECONDS,
    },
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

async function proxyXpi(request, env) {
  const token = env?.[GITHUB_TOKEN_NAME];
  if (!token) {
    return unavailableResponse(503, "download_source_not_configured");
  }

  const version = new URL(request.url).searchParams.get("version");
  if (version !== null && !RELEASE_VERSION_PATTERN.test(version)) {
    return jsonResponse({ error: "invalid_version" }, 400);
  }

  const asset = await getLatestXpiAsset(token, version);
  if (!asset) {
    return unavailableResponse(502, "download_temporarily_unavailable");
  }

  const etag = assetEtag(asset);
  const headers = buildDownloadHeaders(new Headers(), asset, true);

  if (isNotModified(request, asset, etag)) {
    headers.delete("Content-Length");
    return new Response(null, { status: 304, headers });
  }

  if (request.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }

  const upstreamResponse = await fetchAssetBody(request, asset, token);
  if (
    !upstreamResponse ||
    (!upstreamResponse.ok &&
      upstreamResponse.status !== 304 &&
      upstreamResponse.status !== 416)
  ) {
    return unavailableResponse(502, "download_temporarily_unavailable");
  }

  return new Response(
    upstreamResponse.status === 304 || upstreamResponse.status === 416
      ? null
      : upstreamResponse.body,
    {
      status: upstreamResponse.status,
      headers: buildDownloadHeaders(
        upstreamResponse.headers,
        asset,
        upstreamResponse.status === 200 && !request.headers.has("range"),
      ),
    },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return methodNotAllowed();
      }

      return new Response(
        request.method === "HEAD" ? null : JSON.stringify({ status: "ok" }),
        {
          status: 200,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
          },
        },
      );
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

    if (url.pathname === UPDATES_PATH) {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return methodNotAllowed();
      }

      try {
        return await proxyUpdatesJson(request, env);
      } catch (error) {
        console.error(
          JSON.stringify({
            event: "updates_manifest_proxy_exception",
            name: error instanceof Error ? error.name : "Error",
          }),
        );
        return unavailableResponse();
      }
    }

    if (url.pathname !== DOWNLOAD_PATH) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return methodNotAllowed();
    }

    try {
      return await proxyXpi(request, env);
    } catch (error) {
      console.error(
        JSON.stringify({
          event: "xpi_proxy_exception",
          name: error instanceof Error ? error.name : "Error",
        }),
      );

      return unavailableResponse(502, "download_temporarily_unavailable");
    }
  },
};
