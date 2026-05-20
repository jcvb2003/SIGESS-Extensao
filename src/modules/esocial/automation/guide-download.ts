import { logger } from "../../../shared/services/logger";
import {
  HOOKED_BUTTON_ATTR,
  GUIDE_OBSERVER_ATTR,
  ESOCIAL_PENDING_DOWNLOAD_HINT_KEY,
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
import { getBestCpf, getBestNome, extractCompetenciaFromUrl, extractCompetenciaFromDom } from "../utils/esocial-extractors";
import { reportBatchStatus } from "./overlay-ui";
import { esocialMessages } from "../utils/status-messages";

export { baixarGuiaPdfDirecto };

function baixarGuiaPdfDirecto(guiaUrl: string, competencia: string, boletoGerado = false, valorDeclarado?: number, valorPago?: number) {
  return baixarGuiaPdf(guiaUrl, competencia, boletoGerado, valorDeclarado, valorPago);
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
            window.location.href = targetUrl;
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

async function baixarGuiaPdf(guiaUrl: string, competencia: string, boletoGerado = false, valorDeclarado?: number, valorPago?: number) {
  const downloadingMsg = esocialMessages.manualEmitGuideDetected();
  logger.info("eSocial", downloadingMsg.title);
  reportBatchStatus(downloadingMsg.status, downloadingMsg.title, downloadingMsg.description, {
    progressStep: 2,
    progressTotal: 3,
    overlayState: {
      step: 2,
      total: 3,
      title: "Executando script no eSocial",
      description: `Preparando download do boleto de ${formatCompetencia(competencia)}...`,
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

        return baixarGuiaPdf(resolvedPdfUrl, competencia, boletoGerado, valorDeclarado, valorPago);
      }

      if (html && looksLikeHtmlDocument(html)) {
        const cpf = await getBestCpf();
        const nomeBruto = await getBestNome();
        const filename = buildEsocialFilename(nomeBruto, cpf, competencia);

        await savePendingEsocialDownloadHint(filename);
        openBlobInNewTab(blob, contentType || "text/html");
        const tabMsg = esocialMessages.guideOpenedInNewTab(filename);
        logger.info("eSocial", tabMsg.title);
        reportBatchStatus("boleto_salvo", tabMsg.title, tabMsg.description, {
          loginConcluido: true,
          progressStep: 3,
          progressTotal: 3,
          boletoGerado,
          boletoInfo: { detectado: true, competencia: formatCompetencia(competencia), valorDeclarado, valorPago },
          overlayState: {
            step: 3,
            total: 3,
            title: "Boleto aberto em nova aba",
            description: `Finalize a emissão: ${filename}`,
            complete: true,
            hideAt: Date.now() + 4000,
          },
        });
        return;
      }

      throw new Error(
        `O endpoint da guia retornou ${contentType || "conteudo desconhecido"} em vez de PDF.`,
      );
    }

    const cpf = await getBestCpf();
    const nomeBruto = await getBestNome();
    const filename = buildEsocialFilename(nomeBruto, cpf, competencia);

    const successMsg = esocialMessages.pdfDownloadedSuccessfully(filename);
    logger.info("eSocial", successMsg.title);
    reportBatchStatus("boleto_salvo", successMsg.title, successMsg.description, {
      loginConcluido: true,
      progressStep: 3,
      progressTotal: 3,
      boletoGerado,
      boletoInfo: { detectado: true, competencia: formatCompetencia(competencia), valorDeclarado, valorPago },
      overlayState: {
        step: 3,
        total: 3,
        title: "Boleto salvo com sucesso",
        description: `Arquivo: ${filename}`,
        complete: true,
        hideAt: Date.now() + 4000,
      },
    });

    await triggerLocalDownload(blob, filename);
  } finally {
    clearTimeout(timeoutId);
  }
}

async function triggerLocalDownload(blob: Blob, filename: string) {
  const pdfBlob = blob.type === "application/pdf" ? blob : new Blob([blob], { type: "application/pdf" });
  await savePendingEsocialDownloadHint(filename);

  const objectUrl = URL.createObjectURL(pdfBlob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.style.display = "none";
  const root = document.body ?? document.documentElement;
  root.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function openBlobInNewTab(blob: Blob, mimeType: string) {
  const typedBlob = blob.type ? blob : new Blob([blob], { type: mimeType });
  const objectUrl = URL.createObjectURL(typedBlob);
  window.open(objectUrl, "_blank", "noopener");
  window.setTimeout(() => {
    URL.revokeObjectURL(objectUrl);
  }, 60_000);
}

async function savePendingEsocialDownloadHint(filename: string) {
  try {
    const browserAPI = typeof browser !== "undefined" ? browser : (window as any).chrome;
    await browserAPI.storage?.local?.set?.({
      [ESOCIAL_PENDING_DOWNLOAD_HINT_KEY]: {
        filename,
        expiresAt: Date.now() + 2 * 60 * 1000,
      },
    });
  } catch (error) {
    console.debug("[SIGESS] Nao foi possivel salvar dica de rename do eSocial:", error);
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
