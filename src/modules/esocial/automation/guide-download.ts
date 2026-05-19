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

export { baixarGuiaPdf as baixarGuiaPdfDirecto };

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
            reportBatchStatus(
              "erro",
              "Nao foi possivel resolver a URL da guia",
              "O botao foi encontrado, mas a extensao nao conseguiu descobrir o endereco final da emissao.",
              { lastError: "URL de emissao nao resolvida." },
            );
            return;
          }

          try {
            await baixarGuiaPdf(targetUrl, competencia);
          } catch (error) {
            console.error("[SIGESS] Falha ao baixar guia do eSocial:", error);
            reportBatchStatus(
              "erro",
              "Falha ao baixar a guia",
              "O eSocial nao devolveu o PDF esperado para a guia. A extensao voltou para o fluxo normal da pagina.",
              { lastError: error instanceof Error ? error.message : String(error) },
            );
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

async function baixarGuiaPdf(guiaUrl: string, competencia: string) {
  reportBatchStatus(
    "processando",
    "Baixando PDF da guia",
    `A folha foi encerrada e a extensao esta solicitando o PDF da competencia ${formatCompetencia(competencia)}.`,
    {
      progressStep: 2,
      progressTotal: 3,
      overlayState: {
        step: 2,
        total: 3,
        title: "Executando script no eSocial",
        description: `Preparando o download do PDF da competencia ${formatCompetencia(competencia)}.`,
      },
    },
  );

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

        return baixarGuiaPdf(resolvedPdfUrl, competencia);
      }

      if (html && looksLikeHtmlDocument(html)) {
        const periodo = formatCompetencia(competencia);
        const cpf = await getBestCpf();
        const nomeBruto = await getBestNome();
        const filename = buildEsocialFilename(nomeBruto, cpf, competencia);

        await savePendingEsocialDownloadHint(filename);
        openBlobInNewTab(blob, contentType || "text/html");
        reportBatchStatus(
          "concluido",
          "Guia aberta em nova aba",
          `O eSocial retornou uma pagina HTML de emissao para a competencia ${periodo}. A extensao abriu essa guia em nova aba, como no script manual.`,
          {
            loginConcluido: true,
            progressStep: 3,
            progressTotal: 3,
            overlayState: {
              step: 3,
              total: 3,
              title: "Guia aberta em nova aba",
              description: `A emissao da guia ${filename} foi aberta para finalizacao.`,
              complete: true,
              hideAt: Date.now() + 4000,
            },
          },
        );
        return;
      }

      throw new Error(
        `O endpoint da guia retornou ${contentType || "conteudo desconhecido"} em vez de PDF.`,
      );
    }

    const cpf = await getBestCpf();
    const nomeBruto = await getBestNome();
    const periodo = formatCompetencia(competencia);
    const filename = buildEsocialFilename(nomeBruto, cpf, competencia);

    console.log("[SIGESS] Preparado para download:", { filename, cpf, nomeBruto });

    reportBatchStatus(
      "concluido",
      "PDF baixado com sucesso",
      `A guia da competencia ${periodo} foi gerada e o download ${filename} foi iniciado.`,
      {
        loginConcluido: true,
        progressStep: 3,
        progressTotal: 3,
        overlayState: {
          step: 3,
          total: 3,
          title: "PDF baixado com sucesso",
          description: `A guia ${filename} foi gerada e baixada com sucesso.`,
          complete: true,
          hideAt: Date.now() + 4000,
        },
      },
    );

    console.log("[SIGESS] Triggerando download local...");
    await triggerLocalDownload(blob, filename);
    console.log("[SIGESS] Download completado");
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
