import { StorageService } from "./storage";

const STATIC_CACHE_SETTING = "staticCacheEnabled";
const CACHE_MAX_AGE = "public, max-age=31536000, immutable, stale-while-revalidate=86400, stale-if-error=604800";

// Escopo fechado aos portais usados pelos fluxos da extensão. A configuração
// é global para o usuário; esta lista evita alterar o cache de outros sites.
const ALLOWED_HOSTS = [
  "sso.acesso.gov.br",
  "cadunico.dataprev.gov.br",
  "pesqbrasil-pescadorprofissional.agro.gov.br",
  "pesqbrasil-pescadorprofissional.mpa.gov.br",
  "cav.receita.fazenda.gov.br",
  "www3.cav.receita.fazenda.gov.br",
  "www.receita.fazenda.gov.br",
  "www.tse.jus.br",
  "meu.inss.gov.br",
  "servicos.mte.gov.br",
  "login.esocial.gov.br",
  "www.esocial.gov.br",
  "barra.brasil.gov.br",
  "vlibras.gov.br",
];

const STATIC_TYPES = new Set(["script", "stylesheet", "image", "font", "object", "media"]);
const STATIC_EXTENSION = /\.(?:js|mjs|css|png|jpe?g|gif|svg|webp|ico|woff2?|ttf|otf|wasm)(?:$|[?#])/i;
let enabled = false;
let initialized = false;

function isAllowedUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return url.protocol === "https:" && ALLOWED_HOSTS.some((host) =>
      url.hostname === host || url.hostname.endsWith(`.${host}`),
    );
  } catch {
    return false;
  }
}

function isStatic(details: any): boolean {
  return STATIC_TYPES.has(String(details.type || "")) || STATIC_EXTENSION.test(details.url || "");
}

function onHeadersReceived(details: any): any {
  if (!enabled || !isAllowedUrl(details.url) || !isStatic(details)) return undefined;
  const responseHeaders = Array.isArray(details.responseHeaders) ? details.responseHeaders : [];
  if (responseHeaders.some((header: any) => String(header.name).toLowerCase() === "set-cookie")) return undefined;
  if (responseHeaders.some((header: any) =>
    String(header.name).toLowerCase() === "vary" && String(header.value || "").trim() === "*",
  )) return undefined;

  const headers = responseHeaders.filter((header: any) =>
    !["cache-control", "pragma", "expires"].includes(String(header.name).toLowerCase()),
  );
  headers.push({ name: "Cache-Control", value: CACHE_MAX_AGE });
  return { responseHeaders: headers };
}

export async function clearStaticCache(): Promise<void> {
  // Firefox não oferece remoção do HTTP cache por origem. Esta ação usa a API
  // oficial e, por isso, limpa o cache HTTP global sem tocar em cookies, senhas
  // ou armazenamento local.
  await (browser as any).browsingData.removeCache({});
}

export function initializeStaticCachePolicy(): void {
  if (initialized || typeof browser === "undefined" || !(browser as any).webRequest) return;
  initialized = true;
  StorageService.getSettings().then((settings) => { enabled = Boolean(settings.staticCacheEnabled); });
  (browser as any).storage?.onChanged?.addListener((changes: any, areaName: string) => {
    if (areaName === "local" && changes[STATIC_CACHE_SETTING]) {
      enabled = Boolean(changes[STATIC_CACHE_SETTING].newValue);
    }
  });
  (browser as any).webRequest.onHeadersReceived.addListener(
    onHeadersReceived,
    { urls: ["<all_urls>"] },
    ["blocking", "responseHeaders"],
  );
}
