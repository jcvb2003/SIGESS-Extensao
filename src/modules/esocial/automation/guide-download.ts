import { logger } from "../../../shared/services/logger";
import {
  HOOKED_BUTTON_ATTR,
  GUIDE_OBSERVER_ATTR,
  MANUAL_GUIDE_DOWNLOAD_KEY,
} from "../utils/esocial-constants";
import { resolveGuiaDownloadUrlFromAnchor } from "../services/guide-url-resolver";
import {
  looksLikeHtmlDocument,
  looksLikePdfBuffer,
  safeDecodeBufferAsText,
  resolvePdfUrlFromHtml,
} from "../services/document-parser";
import { buildEsocialFilename, formatCompetencia } from "../utils/file-naming";
import { extractCompetenciaFromUrl, extractCompetenciaFromDom } from "../utils/esocial-extractors";
import { reportBatchStatus } from "./overlay-ui";
import { esocialMessages } from "../utils/status-messages";

export { baixarGuiaPdfDirecto };

type BoletoValores = {
  valorComercializado?: number;
  valorDeclarado?: number;
  valorPago?: number;
};

type EsocialDownloadIdentity = {
  cpf: string;
  nome: string;
};

function baixarGuiaPdfDirecto(
  guiaUrl: string,
  competencia: string,
  boletoGerado = false,
  valores: BoletoValores = {},
) {
  return baixarGuiaPdf(guiaUrl, competencia, boletoGerado, valores);
}

export function observarBotaoEmitirGuia() {
  const sigessWindow = window as unknown as Record<string, unknown>;

  if (sigessWindow[GUIDE_OBSERVER_ATTR]) {
    console.log("[SIGESS] Observer já foi inicializado");
    return;
  }

  const observerTarget = document.body || document.documentElement;
  if (!observerTarget) {
    return;
  }

  sigessWindow[GUIDE_OBSERVER_ATTR] = true;
  console.log("[SIGESS] Observer de botoes Emitir Guia inicializado para:", window.location.href);

  let foundCount = 0;
  const observer = new MutationObserver(() => {
    const botoesEmitirGuia = Array.from(
      document.querySelectorAll("a"),
    ) as HTMLAnchorElement[];
    const candidatos = botoesEmitirGuia.filter((anchor) => isEmitirGuiaAnchor(anchor));
    if (candidatos.length === 0) return;

    for (const botaoEmitirGuia of candidatos) {
      if (botaoEmitirGuia.getAttribute(HOOKED_BUTTON_ATTR) === "true") continue;

      foundCount++;
      botaoEmitirGuia.setAttribute(HOOKED_BUTTON_ATTR, "true");
      console.log("[SIGESS] Botao encontrado e listener registrado");

      botaoEmitirGuia.addEventListener(
        "click",
        async (event) => {
          console.log("[SIGESS] Clique detectado no botao");

          event.preventDefault();
          event.stopPropagation();
          markManualGuideDownloadInProgress();

          const targetUrl = resolveGuiaDownloadUrlFromAnchor(botaoEmitirGuia);
          const competencia =
            extractCompetenciaFromUrl(targetUrl) ||
            extractCompetenciaFromUrl(window.location.href) ||
            extractCompetenciaFromDom();

          console.log("[SIGESS] URL atual:", window.location.href);
          console.log("[SIGESS] Competencia extraida:", competencia);

          if (!targetUrl || !competencia) {
            const resolveMsg = esocialMessages.failedToResolveGuideUrl();
            logger.error("eSocial", resolveMsg.title);
            reportBatchStatus(resolveMsg.status, resolveMsg.title, resolveMsg.description, {
              lastError: "URL de emissão não resolvida."
            });
            return;
          }

          try {
            await baixarGuiaPdf(targetUrl, competencia);
          } catch (error) {
            const downloadMsg = esocialMessages.failedToDownloadGuide();
            logger.error("eSocial", downloadMsg.title, { error: error instanceof Error ? error.message : String(error) });
            reportBatchStatus(downloadMsg.status, downloadMsg.title, downloadMsg.description, {
              lastError: error instanceof Error ? error.message : String(error)
            });
          } finally {
            clearManualGuideDownloadInProgress();
          }
        },
        { capture: true },
      );
    }

    if (foundCount > 0 && candidatos.every((a) => a.getAttribute(HOOKED_BUTTON_ATTR) === "true")) {
      observer.disconnect();
    }
  });

  observer.observe(observerTarget, {
    childList: true,
    subtree: true,
    attributes: false,
  });
}

function markManualGuideDownloadInProgress() {
  sessionStorage.setItem(MANUAL_GUIDE_DOWNLOAD_KEY, String(Date.now() + 2 * 60 * 1000));
}

function clearManualGuideDownloadInProgress() {
  sessionStorage.removeItem(MANUAL_GUIDE_DOWNLOAD_KEY);
}

async function baixarGuiaPdf(
  guiaUrl: string,
  competencia: string,
  boletoGerado = false,
  valores: BoletoValores = {},
) {
  const downloadingMsg = esocialMessages.manualEmitGuideDetected();
  logger.info("eSocial", downloadingMsg.title);
  reportBatchStatus(downloadingMsg.status, downloadingMsg.title, downloadingMsg.description, {
    progressStep: 3,
    progressTotal: 3,
    overlayState: {
      step: 3,
      total: 3,
      title: "Preparando o download do boleto",
      description: `Preparando o download do boleto de ${formatCompetencia(competencia)}...`,
    },
  });

  console.log("[SIGESS] Iniciando fetch da guia URL:", guiaUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);

  try {
    const response = await fetch(guiaUrl, {
      method: "GET",
      credentials: "include",
      signal: controller.signal,
    });

    console.log("[SIGESS] Fetch respondeu com status:", response.status);
    if (!response.ok) {
      throw new Error(`Falha ao baixar guia: HTTP ${response.status}`);
    }

    console.log("[SIGESS] Convertendo resposta para blob...");
    const contentType = (response.headers.get("content-type") || "").toLowerCase();
    const blob = await response.blob();
    console.log("[SIGESS] Blob criado, tamanho:", blob.size, "bytes");

    const buffer = await blob.arrayBuffer();
    console.log("[SIGESS] Buffer extraído");
    const isPdf =
      contentType.includes("application/pdf") || looksLikePdfBuffer(buffer);
    console.log("[SIGESS] isPdf:", isPdf, "contentType:", contentType);

    if (!isPdf) {
      const html = await safeDecodeBufferAsText(buffer);
      const resolvedPdfUrl = html ? resolvePdfUrlFromHtml(html, guiaUrl) : null;

      if (resolvedPdfUrl && resolvedPdfUrl !== guiaUrl) {
        console.warn("[SIGESS] Endpoint da guia retornou HTML. Usando URL interna do PDF.", {
          competencia,
          guiaUrl,
          resolvedPdfUrl,
          contentType,
        });

        return baixarGuiaPdf(resolvedPdfUrl, competencia, boletoGerado, valores);
      }

      if (html && looksLikeHtmlDocument(html)) {
        throw new Error(
          `O endpoint da guia retornou HTML${contentType ? ` (${contentType})` : ""}; a emissão não foi confirmada como PDF.`,
        );
      }

      throw new Error(
        `O endpoint da guia retornou ${contentType || "conteudo desconhecido"} em vez de PDF.`,
      );
    }

    const identity = await getEsocialDownloadIdentity();
    const filename = buildEsocialFilename(identity.nome, identity.cpf, competencia);

    await triggerLocalDownload(blob, filename);

    const successMsg = esocialMessages.pdfDownloadedSuccessfully(filename);
    logger.info("eSocial", successMsg.title);
    reportBatchStatus("boleto_salvo", successMsg.title, successMsg.description, {
      loginConcluido: true,
      progressStep: 3,
      progressTotal: 3,
      boletoGerado,
      boletoInfo: { detectado: true, competencia: formatCompetencia(competencia), ...valores },
      overlayState: {
        step: 3,
        total: 3,
        title: "Boleto salvo com sucesso",
        description: `Arquivo: ${filename}`,
        complete: true,
        hideAt: Date.now() + 4000,
      },
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function triggerLocalDownload(blob: Blob, filename: string) {
  const pdfBlob = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
  const dataUrl = await blobToDataUrl(pdfBlob);
  const browserAPI = typeof browser !== "undefined" ? browser : (window as any).chrome;
  const response = await browserAPI.runtime.sendMessage({
    action: "downloadESocialGuide",
    dataUrl,
    filename,
  });

  if (!response?.success) {
    throw new Error(response?.error || "Não foi possível iniciar o download do boleto.");
  }

  console.log("[SIGESS] Download delegado ao background:", {
    filename,
    downloadId: response.downloadId,
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
      } else {
        reject(new Error("Não foi possível preparar o PDF para download."));
      }
    };
    reader.onerror = () => reject(reader.error || new Error("Falha ao ler o PDF para download."));
    reader.readAsDataURL(blob);
  });
}

async function getEsocialDownloadIdentity(): Promise<EsocialDownloadIdentity> {
  const browserAPI = typeof browser !== "undefined" ? browser : (window as any).chrome;
  const response = await browserAPI.runtime.sendMessage({ action: "getESocialDownloadIdentity" });

  if (!response?.success || !response.data?.cpf || !response.data?.nome) {
    throw new Error(response?.error || "NÃ£o foi possÃ­vel identificar o associado do boleto.");
  }

  return response.data as EsocialDownloadIdentity;
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
