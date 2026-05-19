import {
  EMITIR_GUIA_REGEX,
  DIRECT_PDF_HTTPS_REGEX,
  DIRECT_PDF_RELATIVE_REGEX,
} from "../utils/esocial-constants";
import { resolveGuiaDownloadUrlFromAnchor } from "./guide-url-resolver";

export function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

export function looksLikeHtmlDocument(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("<body") ||
    normalized.includes("<iframe") ||
    normalized.includes("<embed")
  );
}

export function looksLikePdfBuffer(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer.slice(0, 5));
  return (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  );
}

export async function safeDecodeBufferAsText(buffer: ArrayBuffer): Promise<string | null> {
  try {
    return new TextDecoder("utf-8").decode(buffer);
  } catch {
    return null;
  }
}

export function resolveGuiaUrlFromDocument(doc: Document, competencia: string): string | null {
  const buildPortalUrl = (path: string): string => {
    if (/^https?:\/\//i.test(path)) return path;
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    return `https://www.esocial.gov.br/portal${normalizedPath}`;
  };

  const anchor =
    (doc.querySelector("#btn-emitir-guia") as HTMLAnchorElement | null) ||
    (Array.from(doc.querySelectorAll("a")).find((item) =>
      isEmitirGuiaAnchor(item as HTMLAnchorElement),
    ) as HTMLAnchorElement | undefined) ||
    null;

  const resolvedFromAnchor = anchor ? resolveGuiaDownloadUrlFromAnchor(anchor) : null;
  if (resolvedFromAnchor) {
    return resolvedFromAnchor;
  }

  const html = doc.documentElement?.outerHTML || "";
  const guiaPathMatch = EMITIR_GUIA_REGEX.exec(html);
  if (guiaPathMatch?.[0]) {
    return buildPortalUrl(`/${guiaPathMatch[0].replace(/^\//, "")}`);
  }

  if (/Folha de pagamento encerrada com sucesso/i.test(html)) {
    return buildPortalUrl(`/FolhaPagamento/EmitirGuia/EmitirGuiaMensal?competencia=${competencia}`);
  }

  console.warn(
    "[SIGESS] HTML de fechamento sem ancora explicita da guia. Aplicando fallback direto para EmitirGuiaMensal.",
    {
      competencia,
      preview: html.slice(0, 1200),
    },
  );

  return buildPortalUrl(`/FolhaPagamento/EmitirGuia/EmitirGuiaMensal?competencia=${competencia}`);
}

export function resolvePdfUrlFromHtml(html: string, baseUrl: string): string | null {
  try {
    const doc = parseHtml(html);
    const selectors = [
      "iframe[src]",
      "embed[src]",
      "object[data]",
      "a[href]",
    ];

    for (const selector of selectors) {
      const elements = Array.from(doc.querySelectorAll(selector));
      for (const element of elements) {
        const rawUrl =
          element.getAttribute("src") ||
          element.getAttribute("data") ||
          element.getAttribute("href") ||
          "";

        if (!rawUrl) continue;

        const normalized = rawUrl.toLowerCase();
        if (
          normalized.includes(".pdf") ||
          normalized.includes("application/pdf") ||
          normalized.includes("emitirguia") ||
          normalized.includes("download")
        ) {
          const resolvedUrl = new URL(rawUrl, baseUrl).toString();
          if (isAllowedEsocialGuideUrl(resolvedUrl)) {
            return resolvedUrl;
          }
        }
      }
    }

    const directPdfMatch =
      DIRECT_PDF_HTTPS_REGEX.exec(html) ||
      DIRECT_PDF_RELATIVE_REGEX.exec(html);

    if (directPdfMatch?.[0]) {
      const resolvedUrl = new URL(directPdfMatch[0], baseUrl).toString();
      return isAllowedEsocialGuideUrl(resolvedUrl) ? resolvedUrl : null;
    }

    return null;
  } catch {
    return null;
  }
}

function isEmitirGuiaAnchor(anchor: HTMLAnchorElement): boolean {
  const text = (anchor.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
  const href = anchor.getAttribute("href") || "";
  const onclick = anchor.getAttribute("onclick") || "";

  return (
    text.includes("emitir guia") &&
    (href.includes("EmitirGuiaMensal") ||
      onclick.includes("EmitirGuiaMensal") ||
      anchor.id === "btn-emitir-guia")
  );
}

function isAllowedEsocialGuideUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      url.hostname === "www.esocial.gov.br" &&
      (url.pathname.includes("/portal/FolhaPagamento/EmitirGuia/") ||
        url.pathname.toLowerCase().endsWith(".pdf"))
    );
  } catch {
    return false;
  }
}
