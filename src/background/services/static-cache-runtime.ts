import { StorageService } from "./storage";

const CACHE_NAME = "sigess-static-cache-v5";
const MAX_ENTRY_BYTES = 12 * 1024 * 1024;
const MAX_MEMORY_BYTES = 96 * 1024 * 1024;
const STATIC_TYPES = new Set(["image", "font", "stylesheet", "script"]);
const STATIC_PATH = /\/(?:(?:assets|static|css|js|fonts?|img|images|icons?|bundles|publico|caepf-main|content\/imagens|_next\/static)\/|\+\+(?:webresource|theme|plone)\+\+|@@images)/i;
const STATIC_EXTENSION = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf)(?:$|[?#])/i;
const SENSITIVE_COOKIE = /(?:^|[;,\s])(?:csrf|xsrf|sid|token|jwt|auth|govbr|jsessionid)(?:=|[;,\s])/i;
const INFRASTRUCTURE_COOKIE = /^(?:TS[^=]*|INGRESSCOOKIE)$/i;
const ALLOWED_HOSTS = [
  "sso.acesso.gov.br", "cadunico.dataprev.gov.br",
  "pesqbrasil-pescadorprofissional.agro.gov.br",
  "pesqbrasil-pescadorprofissional.mpa.gov.br",
  "cav.receita.fazenda.gov.br", "www3.cav.receita.fazenda.gov.br",
  "www.tse.jus.br", "meu.inss.gov.br", "servicos.mte.gov.br",
  "login.esocial.gov.br", "www.esocial.gov.br",
  "www.receita.fazenda.gov.br", "barra.brasil.gov.br", "vlibras.gov.br",
];

type Header = { name: string; value?: string; binaryValue?: string };
type CacheEntry = { dataUrl: string; bytes: number; storedAt: number };
let enabled = false;
let initialized = false;
let memoryBytes = 0;
const memoryCache = new Map<string, CacheEntry>();
const responseHeaders = new Map<string, Header[]>();
const responseStatus = new Map<string, number>();
const requestCookies = new Map<string, boolean>();
const cspByFrame = new Map<string, string[]>();
const pendingCaptures = new Set<string>();
const cookieScopes = new Set<string>();

function cookieScope(tabId: number, rawUrl: string): string {
  try { return `${tabId}|${new URL(rawUrl).origin}`; } catch { return `${tabId}|`; }
}

function frameScope(tabId: number, frameId: number): string {
  return `${tabId}|${frameId}`;
}

function allowedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ALLOWED_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

function aggressiveCacheHost(rawUrl: string): boolean {
  return allowedUrl(rawUrl);
}

function staticRequest(details: any): boolean {
  return STATIC_TYPES.has(String(details.type || "")) && (STATIC_PATH.test(details.url || "") || STATIC_EXTENSION.test(details.url || ""));
}

function header(headers: Header[], name: string): string | undefined {
  return headers.find((item) => item.name.toLowerCase() === name)?.value;
}

function hasSensitiveCookie(value: string): boolean {
  return SENSITIVE_COOKIE.test(value);
}

function onlyInfrastructureSetCookie(value: string): boolean {
  const name = value.split("=", 1)[0].trim();
  return INFRASTRUCTURE_COOKIE.test(name);
}

function rewriteRelativeCss(text: string, sourceUrl: string): string {
  return text.replace(/url\(\s*(["']?)(?!data:|https?:|\/\/|#)([^"')]+)\1\s*\)/gi, (match, quote: string, value: string) => {
    try {
      return `url(${quote}${new URL(value.trim(), sourceUrl).href}${quote})`;
    } catch {
      return match;
    }
  });
}

function dataAllowed(details: any, type: string): boolean {
  const policies = cspByFrame.get(frameScope(Number(details.tabId), Number(details.frameId || 0)));
  if (!policies?.length) return true;
  const name = type === "script" ? "script-src" : type === "stylesheet" ? "style-src" : type === "font" ? "font-src" : "img-src";
  return policies.every((policy) => {
    const directives = policy.split(";").map((part) => part.trim().split(/\s+/));
    const directive = directives.find((tokens) => tokens[0] === name) || directives.find((tokens) => tokens[0] === "default-src");
    return !directive || directive.includes("data:");
  });
}

function requiresOriginalResourceUrl(details: any): boolean {
  try {
    const hostname = new URL(details.url).hostname;
    const receitaHost = hostname === "receita.fazenda.gov.br" || hostname.endsWith(".receita.fazenda.gov.br");
    return receitaHost && details.type !== "image";
  } catch {
    return true;
  }
}

function dataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mimeType || "application/octet-stream"};base64,${btoa(binary)}`;
}

async function waitForResponseMetadata(requestId: string): Promise<void> {
  for (let attempt = 0; attempt < 20; attempt++) {
    if (responseStatus.has(requestId) && responseHeaders.has(requestId)) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

function releaseCapture(requestId: string): void {
  pendingCaptures.delete(requestId);
  responseHeaders.delete(requestId);
  responseStatus.delete(requestId);
  requestCookies.delete(requestId);
}

function remember(url: string, entry: CacheEntry): void {
  const old = memoryCache.get(url);
  if (old) memoryBytes -= old.bytes;
  memoryCache.set(url, entry);
  memoryBytes += entry.bytes;
  while (memoryBytes > MAX_MEMORY_BYTES) {
    const oldest = memoryCache.keys().next().value as string | undefined;
    if (!oldest) break;
    const removed = memoryCache.get(oldest);
    if (removed) memoryBytes -= removed.bytes;
    memoryCache.delete(oldest);
  }
}

async function warm(): Promise<void> {
  try {
    const cache = await caches.open(CACHE_NAME);
    for (const request of await cache.keys()) {
      const response = await cache.match(request);
      if (!response) continue;
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (bytes.byteLength <= MAX_ENTRY_BYTES) remember(request.url, { dataUrl: dataUrl(bytes, response.headers.get("content-type") || "application/octet-stream"), bytes: bytes.byteLength, storedAt: Date.now() });
    }
  } catch (error) { console.warn("[SIGESS] Falha ao aquecer cache estático", error); }
}

async function save(details: any, bytes: Uint8Array): Promise<void> {
  if (!enabled || bytes.byteLength === 0 || bytes.byteLength > MAX_ENTRY_BYTES) {
    return;
  }
  const statusCode = details.statusCode ?? responseStatus.get(details.requestId);
  if (statusCode !== 200) {
    return;
  }
  const headers: Header[] = details.responseHeaders || responseHeaders.get(details.requestId) || [];
  const contentType = header(headers, "content-type") || "application/octet-stream";
  const text = contentType.includes("css") || contentType.includes("javascript") ? new TextDecoder().decode(bytes) : "";
  const setCookies = headers
    .filter((item) => item.name.toLowerCase() === "set-cookie")
    .map((item) => item.value || "");
  if (setCookies.some((setCookie) => !onlyInfrastructureSetCookie(setCookie)) || header(headers, "content-range") || header(headers, "vary") === "*") {
    return;
  }
  let payload = bytes;
  if (contentType.includes("css")) payload = new TextEncoder().encode(rewriteRelativeCss(text, details.url));
  if (
    contentType.includes("javascript") &&
    (
      /\.mjs(?:$|[?#])/i.test(details.url) ||
      /(?:^|[;\s])import\s*(?:\(|["'])|__webpack_require__\.(?:p|u)|document\.currentScript|webpackChunk/i.test(text)
    )
  ) {
    return;
  }
  const mimeType = contentType.split(";")[0].trim();
  remember(details.url, { dataUrl: dataUrl(payload, mimeType), bytes: payload.byteLength, storedAt: Date.now() });
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(details.url, new Response(new Blob([payload as any]), { status: 200, headers: { "Content-Type": contentType } }));
  } catch (error) { console.warn("[SIGESS] Falha ao persistir cache estático", error); }
}

async function handleRequest(details: any): Promise<any> {
  if (details.type === "main_frame" && typeof details.tabId === "number") {
    for (const scope of cspByFrame.keys()) if (scope.startsWith(`${details.tabId}|`)) cspByFrame.delete(scope);
    for (const scope of cookieScopes) if (scope.startsWith(`${details.tabId}|`)) cookieScopes.delete(scope);
  }
  const allowed = allowedUrl(details.url);
  if (!allowed) return {};
  if (!enabled) {
    return {};
  }
  if (details.method !== "GET" || !staticRequest(details)) {
    return {};
  }
  if (requiresOriginalResourceUrl(details)) {
    return {};
  }
  if (requestCookies.get(details.requestId)) {
    return {};
  }
  if (!aggressiveCacheHost(details.url) && typeof details.tabId === "number" && cookieScopes.has(cookieScope(details.tabId, details.url))) {
    return {};
  }
  if (!dataAllowed(details, String(details.type))) {
    return {};
  }
  const cached = memoryCache.get(details.url);
  if (cached) {
    return { redirectUrl: cached.dataUrl };
  }
  pendingCaptures.add(details.requestId);
  const filter = (browser as any).webRequest.filterResponseData(details.requestId);
  const chunks: Uint8Array[] = [];
  filter.ondata = (event: any) => { chunks.push(new Uint8Array(event.data)); filter.write(event.data); };
  filter.onstop = async () => {
    filter.close();
    const bytes = new Uint8Array(chunks.reduce((sum, item) => sum + item.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    await waitForResponseMetadata(details.requestId);
    try {
      await save({
        ...details,
        statusCode: responseStatus.get(details.requestId),
        responseHeaders: responseHeaders.get(details.requestId) || [],
      }, bytes);
    } finally {
      releaseCapture(details.requestId);
    }
  };
  filter.onerror = () => {
    releaseCapture(details.requestId);
  };
  return {};
}

export async function clearStaticCacheRuntime(): Promise<void> {
  memoryCache.clear(); memoryBytes = 0; responseHeaders.clear(); responseStatus.clear(); requestCookies.clear(); pendingCaptures.clear(); cookieScopes.clear(); cspByFrame.clear();
  await caches.delete(CACHE_NAME);
}

export function initializeStaticCacheRuntime(): void {
  if (initialized || typeof browser === "undefined" || !(browser as any).webRequest) return;
  initialized = true;
  void StorageService.getSettings().then((settings) => { enabled = Boolean(settings.staticCacheEnabled); if (enabled) void warm(); });
  (browser as any).storage?.onChanged?.addListener((changes: any, areaName: string) => {
    if (areaName !== "local" || !changes.staticCacheEnabled) return;
    enabled = Boolean(changes.staticCacheEnabled.newValue);
    if (enabled) void warm(); else void clearStaticCacheRuntime();
  });
  const all = { urls: ["<all_urls>"] };
  (browser as any).webRequest.onBeforeSendHeaders.addListener((details: any) => {
    const cookie = (details.requestHeaders || []).find((item: Header) => item.name.toLowerCase() === "cookie")?.value || "";
    const sensitive = hasSensitiveCookie(cookie);
    requestCookies.set(details.requestId, sensitive);
    if (cookie && typeof details.tabId === "number") cookieScopes.add(cookieScope(details.tabId, details.url));
  }, all, ["requestHeaders"]);
  (browser as any).webRequest.onHeadersReceived.addListener((details: any) => {
    responseHeaders.set(details.requestId, details.responseHeaders || []);
    responseStatus.set(details.requestId, Number(details.statusCode));
    if ((details.type === "main_frame" || details.type === "sub_frame") && typeof details.tabId === "number") {
      const policies = (details.responseHeaders || [])
        .filter((item: Header) => item.name.toLowerCase() === "content-security-policy")
        .map((item: Header) => item.value || "")
        .filter(Boolean);
      cspByFrame.set(frameScope(details.tabId, Number(details.frameId || 0)), policies);
    }
  }, all, ["responseHeaders"]);
  (browser as any).webRequest.onBeforeRequest.addListener(handleRequest, all, ["blocking"]);
  const clean = (details: any) => {
    if (pendingCaptures.has(details.requestId) && !details.error) return;
    pendingCaptures.delete(details.requestId);
    setTimeout(() => {
      if (pendingCaptures.has(details.requestId)) return;
      responseHeaders.delete(details.requestId); responseStatus.delete(details.requestId); requestCookies.delete(details.requestId);
    }, 15_000);
  };
  (browser as any).webRequest.onCompleted.addListener(clean, all);
  (browser as any).webRequest.onErrorOccurred.addListener(clean, all);
  (browser as any).tabs?.onRemoved?.addListener((tabId: number) => {
    for (const scope of cspByFrame.keys()) if (scope.startsWith(`${tabId}|`)) cspByFrame.delete(scope);
    for (const scope of cookieScopes) if (scope.startsWith(`${tabId}|`)) cookieScopes.delete(scope);
  });
}
