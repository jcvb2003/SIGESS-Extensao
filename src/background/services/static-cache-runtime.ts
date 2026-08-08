import { StorageService } from "./storage";
import { markSigessCacheRedirect } from "./cadastro-performance";

const CACHE_NAME = "sigess-static-cache-v1";
const MAX_ENTRY_BYTES = 2 * 1024 * 1024;
const MAX_MEMORY_BYTES = 32 * 1024 * 1024;
const STATIC_TYPES = new Set(["image", "font", "stylesheet", "script"]);
const STATIC_PATH = /\/(?:assets|static|css|js|fonts?|img|images|icons?)\//i;
const STATIC_EXTENSION = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf)(?:$|[?#])/i;
const SESSION_COOKIE = /(?:^|[;,\s])(csrf|xsrf|session|sess|sid|token|jwt|auth|govbr|jsessionid)(?:=|[;,\s])/i;
const ALLOWED_HOSTS = [
  "sso.acesso.gov.br", "cadunico.dataprev.gov.br",
  "pesqbrasil-pescadorprofissional.agro.gov.br",
  "pesqbrasil-pescadorprofissional.mpa.gov.br",
  "cav.receita.fazenda.gov.br", "www3.cav.receita.fazenda.gov.br",
  "meu.inss.gov.br", "servicos.mte.gov.br",
];

type Header = { name: string; value?: string; binaryValue?: string };
type CacheEntry = { dataUrl: string; bytes: number; storedAt: number };
let enabled = false;
let initialized = false;
let memoryBytes = 0;
const memoryCache = new Map<string, CacheEntry>();
const responseHeaders = new Map<string, Header[]>();
const requestCookies = new Map<string, boolean>();
const cspByTab = new Map<number, string | null>();

function allowedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ALLOWED_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
  } catch { return false; }
}

function staticRequest(details: any): boolean {
  return STATIC_TYPES.has(String(details.type || "")) && STATIC_PATH.test(details.url || "") && STATIC_EXTENSION.test(details.url || "");
}

function header(headers: Header[], name: string): string | undefined {
  return headers.find((item) => item.name.toLowerCase() === name)?.value;
}

function dataAllowed(tabId: number, type: string): boolean {
  const csp = cspByTab.get(tabId);
  if (!csp) return true;
  const directives = csp.split(";").map((part) => part.trim().split(/\s+/));
  const name = type === "script" ? "script-src" : type === "stylesheet" ? "style-src" : type === "font" ? "font-src" : "img-src";
  const directive = directives.find((tokens) => tokens[0] === name) || directives.find((tokens) => tokens[0] === "default-src");
  return !directive || directive.includes("data:");
}

function dataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${mimeType || "application/octet-stream"};base64,${btoa(binary)}`;
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
  if (!enabled || bytes.byteLength === 0 || bytes.byteLength > MAX_ENTRY_BYTES) return;
  const headers = responseHeaders.get(details.requestId) || [];
  const contentType = header(headers, "content-type") || "application/octet-stream";
  const text = contentType.includes("css") || contentType.includes("javascript") ? new TextDecoder().decode(bytes) : "";
  if (header(headers, "set-cookie") || header(headers, "content-range") || header(headers, "vary") === "*") return;
  if (contentType.includes("css") && /url\(\s*["']?(?!data:|https?:|\/\/|#)/i.test(text)) return;
  if (contentType.includes("javascript") && /(?:^|[;\s])import\s*(?:\(|["'])/.test(text)) return;
  const mimeType = contentType.split(";")[0].trim();
  remember(details.url, { dataUrl: dataUrl(bytes, mimeType), bytes: bytes.byteLength, storedAt: Date.now() });
  try {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(details.url, new Response(new Blob([bytes as any]), { status: 200, headers: { "Content-Type": contentType } }));
  } catch (error) { console.warn("[SIGESS] Falha ao persistir cache estático", error); }
}

async function handleRequest(details: any): Promise<any> {
  if (!enabled || details.method !== "GET" || !allowedUrl(details.url) || !staticRequest(details)) return {};
  if (requestCookies.get(details.requestId) || !dataAllowed(details.tabId, String(details.type))) return {};
  const cached = memoryCache.get(details.url);
  if (cached) {
    markSigessCacheRedirect(details.requestId);
    return { redirectUrl: cached.dataUrl };
  }
  const filter = (browser as any).webRequest.filterResponseData(details.requestId);
  const chunks: Uint8Array[] = [];
  filter.ondata = (event: any) => { chunks.push(new Uint8Array(event.data)); filter.write(event.data); };
  filter.onstop = () => {
    filter.close();
    const bytes = new Uint8Array(chunks.reduce((sum, item) => sum + item.byteLength, 0));
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    void save(details, bytes);
  };
  return {};
}

export async function clearStaticCacheRuntime(): Promise<void> {
  memoryCache.clear(); memoryBytes = 0; responseHeaders.clear(); requestCookies.clear();
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
    requestCookies.set(details.requestId, SESSION_COOKIE.test(cookie));
  }, all, ["requestHeaders"]);
  (browser as any).webRequest.onHeadersReceived.addListener((details: any) => {
    responseHeaders.set(details.requestId, details.responseHeaders || []);
    if (details.frameId === 0 && typeof details.tabId === "number") cspByTab.set(details.tabId, header(details.responseHeaders || [], "content-security-policy") || null);
  }, all, ["responseHeaders"]);
  (browser as any).webRequest.onBeforeRequest.addListener(handleRequest, all, ["blocking"]);
  const clean = (details: any) => { responseHeaders.delete(details.requestId); requestCookies.delete(details.requestId); };
  (browser as any).webRequest.onCompleted.addListener(clean, all);
  (browser as any).webRequest.onErrorOccurred.addListener(clean, all);
}
