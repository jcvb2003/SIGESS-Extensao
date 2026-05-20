import { logger } from "../../../shared/services/logger";
import { AppSettings } from "../../../shared/types";
import { extractMoneyValues } from "../utils/esocial-extractors";
import {
  GPS_FLOW_LOCK_KEY,
  GPS_FLOW_DONE_PREFIX,
} from "../utils/esocial-constants";
import { parseHtml, resolveGuiaUrlFromDocument } from "../services/document-parser";
import { resolveGuiaDownloadUrlFromAnchor } from "../services/guide-url-resolver";
import { postJson, getText, buildEsocialUrl } from "../services/esocial-api";
import { buildComercializacaoPayload } from "../services/comercializacao";
import { reportBatchStatus, showSuccessModal } from "./overlay-ui";
import { baixarGuiaPdfDirecto } from "./guide-download";
import { esocialMessages } from "../utils/status-messages";

export async function executarFluxoDiretoGps(settings: AppSettings, competencia: string) {
  const valorComercializado = normalizeMoneyValue(settings.valorComercializado);
  console.debug("[SIGESS] valorComercializado from settings:", settings.valorComercializado);
  console.debug("[SIGESS] valorComercializado normalized:", valorComercializado);
  const comercializacaoResponse = await carregarDadosComercializacao(competencia);

  if (!comercializacaoResponse?.ok) {
    throw new Error("Nao foi possivel carregar a comercializacao da competencia.");
  }

  const comercializacaoHtml = await comercializacaoResponse.text();
  const comercializacaoDoc = parseHtml(comercializacaoHtml);
  const comercializacaoPayload = buildComercializacaoPayload(
    comercializacaoDoc,
    competencia,
    valorComercializado,
  );

  const salvarResp = await postJson(
    "/FolhaPagamento/SeguradoEspecial/SalvarRascunhoComercializacaoProducao",
    comercializacaoPayload,
  );
  console.debug("[SIGESS] SalvarRascunho response:", salvarResp.slice(0, 500));

  const savingMsg = esocialMessages.savingCommercializationDraft();
  logger.info("eSocial", savingMsg.title);
  reportBatchStatus(savingMsg.status, savingMsg.title, savingMsg.description);

  const enviarResp = await postJson(
    "/FolhaPagamento/SeguradoEspecial/EnviarEventosComercializacaoProducao",
    comercializacaoPayload,
  );
  console.debug("[SIGESS] EnviarEventos response:", enviarResp.slice(0, 500));

  const sendingMsg = esocialMessages.sendingCommercializationEvents();
  logger.info("eSocial", sendingMsg.title);
  reportBatchStatus(sendingMsg.status, sendingMsg.title, sendingMsg.description);

  const verificacaoTexto = await verificarAcessoFechamento(competencia);
  if (verificacaoTexto) {
    const verificacao = safeParseJson<{ Sucesso?: boolean }>(verificacaoTexto);
    if (verificacao && verificacao.Sucesso === false) {
      throw new Error("O eSocial não liberou o fechamento da folha.");
    }
  }

  const closureScreenMsg = esocialMessages.loadingClosureScreen();
  logger.info("eSocial", closureScreenMsg.title);
  reportBatchStatus(closureScreenMsg.status, closureScreenMsg.title, closureScreenMsg.description);

  const fechamentoGetResponse = await fetch(
    buildEsocialUrl(`/FolhaPagamento/FechamentoFolha?competencia=${competencia}`),
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!fechamentoGetResponse.ok) {
    throw new Error(`Falha ao carregar fechamento: HTTP ${fechamentoGetResponse.status}`);
  }

  const fechamentoGetHtml = await fechamentoGetResponse.text();
  const fechamentoGetDoc = parseHtml(fechamentoGetHtml);
  const fechamentoForm = buildFechamentoFormData(fechamentoGetDoc, competencia);

  const closingMsg = esocialMessages.closingPayroll();
  logger.info("eSocial", closingMsg.title);
  reportBatchStatus(closingMsg.status, closingMsg.title, closingMsg.description);

  const fechamentoPostResponse = await fetch(
    buildEsocialUrl(`/FolhaPagamento/FechamentoFolha?competencia=${competencia}`),
    {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: fechamentoForm.toString(),
    },
  );

  if (!fechamentoPostResponse.ok) {
    throw new Error(`Falha ao fechar folha: HTTP ${fechamentoPostResponse.status}`);
  }

  const fechamentoPostHtml = await fechamentoPostResponse.text();
  const fechamentoPostDoc = parseHtml(fechamentoPostHtml);
  let guiaUrl = resolveGuiaUrlFromDocument(fechamentoPostDoc, competencia);
  const guiaAposFechamento = await consultarGuiaExistenteViaApi(competencia);

  if (!guiaUrl && guiaAposFechamento.emissaoUrl && (guiaAposFechamento.valorDeclarado ?? 0) > 0) {
    guiaUrl = guiaAposFechamento.emissaoUrl;
  }

  if (!guiaUrl || (guiaAposFechamento.valorDeclarado ?? 0) <= 0) {
    console.warn("[SIGESS] Fechamento sem guia confirmada apos POST:", {
      guiaUrl,
      guiaAposFechamento,
      preview: fechamentoPostHtml.slice(0, 1200),
    });
    throw new Error("A folha nao foi fechada com guia confirmada apos o POST de fechamento.");
  }

  await baixarGuiaPdfDirecto(
    guiaUrl,
    competencia,
    true,
    guiaAposFechamento.valorDeclarado,
    guiaAposFechamento.valorPago,
  );

  sessionStorage.setItem(`${GPS_FLOW_DONE_PREFIX}${competencia}`, "true");
  showSuccessModal("Boleto Gerado!");
}

async function carregarDadosComercializacao(competencia: string) {
  const loadingMsg = esocialMessages.loadingCommercializationData();
  logger.info("eSocial", loadingMsg.title);
  reportBatchStatus(loadingMsg.status, loadingMsg.title, loadingMsg.description);

  const comercializacaoPromise = fetch(
    buildEsocialUrl(
      `/FolhaPagamento/SeguradoEspecial/ComercializacaoProducao?competencia=${competencia}`,
    ),
    {
      method: "GET",
      credentials: "include",
    },
  ).catch((error) => {
    console.debug("[SIGESS] Falha ao carregar comercializacao:", error);
    return null;
  });

  const autonomosPromise = fetch(
    buildEsocialUrl(
      `/FolhaPagamento/SeguradoEspecial/PagamentoAutonomos?competencia=${competencia}`,
    ),
    {
      method: "GET",
      credentials: "include",
    },
  ).catch((error) => {
    console.debug("[SIGESS] Falha ao carregar autonomos:", error);
    return null;
  });

  const [comercializacaoResponse] = await Promise.all([
    comercializacaoPromise,
    autonomosPromise,
  ]);

  return comercializacaoResponse;
}

async function verificarAcessoFechamento(competencia: string) {
  const verifyingMsg = esocialMessages.verifyingClosureAccess();
  logger.info("eSocial", verifyingMsg.title);
  reportBatchStatus(verifyingMsg.status, verifyingMsg.title, verifyingMsg.description);

  try {
    const response = await getText(
      `/FolhaPagamento/SeguradoEspecial/VerificarAcessoFechamentoFolhaAposEnvioEventosComercializacao?competencia=${competencia}`,
    );
    return response;
  } catch (error) {
    console.debug("[SIGESS] Falha ao verificar acesso ao fechamento:", error);
    return null;
  }
}

function buildFechamentoFormData(doc: Document, competencia: string): URLSearchParams {
  const form = doc.querySelector("form");
  console.debug("[SIGESS] Form encontrado:", !!form);

  const elements = Array.from(
    doc.querySelectorAll("form input[name], form select[name], form textarea[name]"),
  ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

  console.debug("[SIGESS] buildFechamentoFormData - elementos encontrados:", elements.length);

  for (const element of elements) {
    const name = element.getAttribute("name");
    if (!name) {
      console.debug("[SIGESS] Elemento sem atributo name:", element.tagName);
      continue;
    }

    if (
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio")
    ) {
      if (element.checked) {
        console.debug("[SIGESS] Adicionando checkbox/radio:", name, element.value || "true");
      }
      continue;
    }

    console.debug("[SIGESS] Adicionando campo:", name, "=", element.value ?? "");
  }

  const params = new URLSearchParams();
  params.set("Competencia", competencia);
  params.set("PeriodoApuracao", `${competencia.slice(0, 4)}-${competencia.slice(4, 6)}`);
  params.set("ProximoPasso", "");
  params.set("IndicatorApuracao", "1");
  params.set("HabilitaEmissaoGuia", "True");
  params.set("DataPagamento", "01/01/0001 00:00:00");
  params.set(
    "UrlRetorno",
    `/portal/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`,
  );
  params.set("TipoEmpregador", "EMPREGADOR_DOMESTICO");
  params.set("FechamentoFolha.EhSeguradoEspecial", "True");
  params.set("IndicadorTipoGuia", "1");
  params.set("commandName", "confirmar");

  console.debug("[SIGESS] Fechamento FormData final:", Array.from(params.entries()));
  console.debug("[SIGESS] Fechamento FormData body:", params.toString());
  return params;
}

function normalizeMoneyValue(value: string): string {
  const trimmed = String(value || "").trim();
  return trimmed || "0";
}

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export function acquireGpsFlowLock(competencia: string): boolean {
  const currentLock = sessionStorage.getItem(GPS_FLOW_LOCK_KEY);
  const alreadyDone = sessionStorage.getItem(`${GPS_FLOW_DONE_PREFIX}${competencia}`) === "true";

  if (alreadyDone) {
    return false;
  }

  if (currentLock && currentLock !== competencia) {
    return false;
  }

  sessionStorage.setItem(GPS_FLOW_LOCK_KEY, competencia);
  return true;
}

export function releaseGpsFlowLock() {
  sessionStorage.removeItem(GPS_FLOW_LOCK_KEY);
}

export type GuiaExistenteInfo = {
  paga: boolean;
  emissaoUrl: string | null;
  valorDeclarado?: number;
  valorPago?: number;
};

export async function consultarGuiaExistente(competencia: string): Promise<GuiaExistenteInfo> {
  try {
    const targetUrl = buildEsocialUrl(
      `/FolhaPagamento/Listagem/Competencias?competencia=${competencia}`,
    );

    const response = await fetch(targetUrl, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      return { paga: false, emissaoUrl: null };
    }

    return extractGuiaExistenteInfo(parseHtml(await response.text()), competencia);
  } catch (error) {
    console.debug("[SIGESS] Falha ao verificar guia existente:", error);
    return { paga: false, emissaoUrl: null };
  }
}

export async function jaExisteGuiaComValor(competencia: string): Promise<boolean> {
  return (await consultarGuiaExistente(competencia)).paga;
}

export function consultarGuiaExistenteNoDom(competencia: string): GuiaExistenteInfo {
  try {
    return extractGuiaExistenteInfo(document, competencia);
  } catch (error) {
    console.debug("[SIGESS] Falha ao extrair guia do DOM:", error);
    return { paga: false, emissaoUrl: null };
  }
}

function extractGuiaExistenteInfo(doc: Document, competencia: string): GuiaExistenteInfo {
  const rows = Array.from(doc.querySelectorAll("table tbody tr"));

  for (const row of rows) {
    const link = row.querySelector(`a[href*="competencia=${competencia}"]`);
    if (!link) continue;

    const cells = Array.from(row.querySelectorAll("td"));
    const declaredCell = cells[3];
    const paidCell = cells[4];
    if (!paidCell) return { paga: false, emissaoUrl: null };

    const declaredValues = extractMoneyValues(declaredCell?.textContent || "");
    const paidValues = extractMoneyValues(paidCell.textContent || "");
    const valorDeclarado = declaredValues[0];
    const valorPago = paidValues[0] ?? 0;
    const hasPaidValue = paidValues.some((value) => value > 0);
    const emitirGuiaAnchor = Array.from(row.querySelectorAll("a")).find((anchor) =>
      isEmitirGuiaAnchor(anchor as HTMLAnchorElement),
    ) as HTMLAnchorElement | undefined;
    const emissaoUrl = emitirGuiaAnchor
      ? resolveGuiaDownloadUrlFromAnchor(emitirGuiaAnchor)
      : null;

    console.debug("[SIGESS] Verificacao de guia existente na competencia:", {
      competencia,
      valorDeclarado,
      valorPago,
      hasPaidValue,
      emissaoUrl,
    });

    return { paga: hasPaidValue, emissaoUrl, valorDeclarado, valorPago };
  }

  return { paga: false, emissaoUrl: null };
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

export function buildCompetenciaFromSettings(settings: AppSettings): string | null {
  const anoAtual = new Date().getFullYear();
  const mes = (settings.selectedMonth || "").padStart(2, "0");
  if (!/^\d{2}$/.test(mes)) return null;
  return `${anoAtual}${mes}`;
}

export async function consultarGuiaExistenteViaApi(competencia: string): Promise<GuiaExistenteInfo> {
  try {
    const targetUrl = buildEsocialUrl(
      `/FolhaPagamento/Listagem/Competencias?competencia=${competencia}`,
    );

    const response = await fetch(targetUrl, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      return { paga: false, emissaoUrl: null };
    }

    return extractGuiaExistenteInfo(parseHtml(await response.text()), competencia);
  } catch (error) {
    console.debug("[SIGESS] Falha ao verificar guia existente via API:", error);
    return { paga: false, emissaoUrl: null };
  }
}

export async function extrairValorTotalComercializadoDaPagina(competencia: string): Promise<number> {
  try {
    const response = await fetch(
      buildEsocialUrl(
        `/FolhaPagamento/SeguradoEspecial/ComercializacaoProducao?competencia=${competencia}`,
      ),
      {
        method: "GET",
        credentials: "include",
      },
    );

    if (!response.ok) {
      console.debug("[SIGESS] Falha ao carregar página de comercialização");
      return 0;
    }

    const html = await response.text();
    const doc = parseHtml(html);

    // Procura por elementos que contêm "total" e extrai valores de dinheiro
    const labels = Array.from(doc.querySelectorAll("*")).filter((el) => {
      const text = (el.textContent || "").toLowerCase();
      return text.includes("total") && text.includes("comercializado");
    });

    for (const label of labels) {
      const text = label.textContent || "";
      const values = extractMoneyValues(text);
      if (values.length > 0) {
        const valor = values[values.length - 1];
        console.debug("[SIGESS] Valor total comercializado encontrado na página:", valor);
        return valor;
      }
    }

    // Procura por qualquer elemento com "total"
    const totalLabels = Array.from(doc.querySelectorAll("*")).filter((el) => {
      const text = (el.textContent || "").trim().toLowerCase();
      return text === "total" || text.startsWith("total");
    });

    for (const label of totalLabels) {
      const nextSibling = label.nextElementSibling;
      if (nextSibling) {
        const values = extractMoneyValues(nextSibling.textContent || "");
        if (values.length > 0) {
          console.debug("[SIGESS] Valor total encontrado:", values[0]);
          return values[0];
        }
      }
    }

    console.debug("[SIGESS] Não foi possível extrair valor total da página de comercialização");
    return 0;
  } catch (error) {
    console.debug("[SIGESS] Erro ao extrair valor total da comercialização:", error);
    return 0;
  }
}

export async function executarFluxoDirectoFromHome(settings: AppSettings): Promise<void> {
  const competencia = buildCompetenciaFromSettings(settings);
  if (!competencia) {
    console.debug("[SIGESS] Não foi possível construir competência a partir de settings");
    return;
  }

  console.debug("[SIGESS] Iniciando fluxo direto da home page para competência:", competencia);

  const checkMsg = esocialMessages.verifyingBoletoStatus();
  logger.info("eSocial", checkMsg.title);
  reportBatchStatus(checkMsg.status, checkMsg.title, checkMsg.description, {
    progressStep: 1,
    progressTotal: 3,
    overlayState: {
      step: 1,
      total: 3,
      title: "Verificando boleto",
      description: `Consultando status do boleto de ${competencia}...`,
    },
  });

  const valorTotalComercializado = await extrairValorTotalComercializadoDaPagina(competencia);

  console.debug("[SIGESS] Valor comercializado para decisao inicial:", {
    valorTotalComercializado,
  });

  if (valorTotalComercializado > 0) {
    const guiaExistente = await consultarGuiaExistenteViaApi(competencia);
    const guiaUrl =
      guiaExistente.emissaoUrl ||
      buildEsocialUrl(`/FolhaPagamento/EmitirGuia/EmitirGuiaMensal?competencia=${competencia}`);

    const issuedMsg = esocialMessages.guideAlreadyIssued(competencia);
    logger.info("eSocial", issuedMsg.title);
    reportBatchStatus(issuedMsg.status, issuedMsg.title, issuedMsg.description, { overlayState: null });
    await baixarGuiaPdfDirecto(
      guiaUrl,
      competencia,
      false,
      guiaExistente.valorDeclarado,
      guiaExistente.valorPago,
    );
    showSuccessModal("Boleto Gerado!");
    return;
  }

  try {
    const initMsg = esocialMessages.initializingGuideGeneration(competencia);
    logger.info("eSocial", initMsg.title);
    reportBatchStatus(initMsg.status, initMsg.title, initMsg.description, {
      progressStep: 2,
      progressTotal: 3,
      overlayState: {
        step: 2,
        total: 3,
        title: "Gerando boleto",
        description: `Executando fluxo de GPS para ${competencia}...`,
      },
    });

    await executarFluxoDiretoGps(settings, competencia);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    let statusMsg = esocialMessages.failedToGenerateGuide();
    if (errorMessage.includes("já foi fechada")) {
      statusMsg = esocialMessages.payrollAlreadyClosed(competencia);
    }

    logger.error("eSocial", statusMsg.title, { error: errorMessage });
    reportBatchStatus(statusMsg.status, statusMsg.title, statusMsg.description, {
      lastError: errorMessage,
      overlayState: null,
    });
  }
}
