import { logger } from "../../../shared/services/logger";
import {
  AppSettings,
  EsocialCompetenciaPlanejada,
  GovBatchCompetenciaResult,
} from "../../../shared/types";
import {
  extractMoneyValues,
  extractCompetenciaFromUrl,
  extractCompetenciaFromDom,
} from "../utils/esocial-extractors";
import {
  GPS_FLOW_LOCK_KEY,
  GPS_FLOW_DONE_PREFIX,
  GPS_FLOW_PENDING_STATE_KEY,
  GPS_FLOW_QUEUE_STATE_KEY,
} from "../utils/esocial-constants";
import { parseHtml, resolveGuiaUrlFromDocument } from "../services/document-parser";
import { resolveGuiaDownloadUrlFromAnchor } from "../services/guide-url-resolver";
import { postJson, getText, buildEsocialUrl } from "../services/esocial-api";
import { buildComercializacaoPayload } from "../services/comercializacao";
import { reportBatchStatus, showSuccessModal } from "./overlay-ui";
import { baixarGuiaPdfDirecto } from "./guide-download";
import { esocialMessages } from "../utils/status-messages";
import { fetchBoletoData, fetchBoletosDoAno, fetchComercializacaoData } from "../services/esocial-data-fetcher";

type PendingGpsClosureState = {
  competencia: string;
  valorComercializado?: string;
  enviaRemuneracoesBody?: string;
  listagemNavigationStartedAt?: number;
  fechamentoNavigationStartedAt?: number;
  fechamentoSubmittedAt?: number;
  competenciaIndex?: number;
  fechamentoRetryCount?: number;
  step:
    | "awaiting_generation_context_page"
    | "awaiting_reopen_page"
    | "awaiting_remuneracoes_page"
    | "awaiting_closure_page"
    | "awaiting_closure_result";
};

type GpsQueueState = {
  competencias: EsocialCompetenciaPlanejada[];
  index: number;
  resultados: GovBatchCompetenciaResult[];
  diagnostico?: Record<string, GuiaExistenteInfo>;
  plano?: Record<string, GpsExecutionAction>;
};

type GpsExecutionAction = "ja_existente" | "reabrir_e_gerar" | "gerar";

function normalizePlannedCompetencias(settings: AppSettings): EsocialCompetenciaPlanejada[] {
  const planned = (settings.competencias || [])
    .filter((item) => /^\d{4}$/.test(String(item.ano)) && /^\d{1,2}$/.test(String(item.mes)))
    .map((item) => ({
      ano: String(item.ano),
      mes: String(item.mes).padStart(2, "0"),
      valorComercializado: normalizeMoneyValue(item.valorComercializado || ""),
    }));

  if (planned.length > 0) return planned;

  const competencia = buildCompetenciaFromSettings(settings);
  if (!competencia) return [];
  return [{
    ano: competencia.slice(0, 4),
    mes: competencia.slice(4, 6),
    valorComercializado: normalizeMoneyValue(settings.valorComercializado),
  }];
}

function competenciaLabel(competencia: string): string {
  return competencia.length === 6
    ? `${competencia.slice(4, 6)}/${competencia.slice(0, 4)}`
    : competencia;
}

function readGpsQueueState(): GpsQueueState | null {
  try {
    const raw = sessionStorage.getItem(GPS_FLOW_QUEUE_STATE_KEY);
    return raw ? JSON.parse(raw) as GpsQueueState : null;
  } catch {
    return null;
  }
}

function writeGpsQueueState(state: GpsQueueState) {
  sessionStorage.setItem(GPS_FLOW_QUEUE_STATE_KEY, JSON.stringify(state));
}

function clearGpsQueueState() {
  sessionStorage.removeItem(GPS_FLOW_QUEUE_STATE_KEY);
}

function queueStatusExtra(state: GpsQueueState, competenciaAtual?: string) {
  return {
    competenciaAtual,
    competenciaIndice: state.index + 1,
    competenciasTotal: state.competencias.length,
    competenciasResultados: state.resultados,
  };
}

function initializeGpsQueue(settings: AppSettings): GpsQueueState {
  const planned = normalizePlannedCompetencias(settings);
  const existing = readGpsQueueState();
  if (existing && existing.competencias.length > 0) {
    const existingSignature = existing.competencias
      .map((item) => `${item.ano}-${item.mes}-${normalizeMoneyValue(item.valorComercializado)}`)
      .join("|");
    const plannedSignature = planned
      .map((item) => `${item.ano}-${item.mes}-${normalizeMoneyValue(item.valorComercializado)}`)
      .join("|");

    // A queue survives page navigations, but it must not leak into a new
    // generation started from the home page. In particular, a previous failed
    // attempt could leave an old production value (e.g. 680,00) while the Web
    // context already contains the new value (e.g. 350,00).
    const hasTerminalError = existing.resultados.some((item) => item.status === "erro");
    if (existingSignature === plannedSignature && !hasTerminalError) return existing;
  }

  const state: GpsQueueState = {
    competencias: planned,
    index: 0,
    resultados: [],
  };
  writeGpsQueueState(state);
  return state;
}

function folhaEncerrada(situacao?: string): boolean {
  const normalized = (situacao || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalized.includes("encerrad") || normalized.includes("fechad");
}

function classificarCompetencia(info: GuiaExistenteInfo): GpsExecutionAction {
  if (hasGuiaEmitida(info)) return "ja_existente";
  return folhaEncerrada(info.situacao) ? "reabrir_e_gerar" : "gerar";
}

async function prepararPlanoDeGeracao(
  state: GpsQueueState,
  competenciaAtual: string,
): Promise<GpsQueueState> {
  if (state.diagnostico && state.plano) return state;

  const anos = Array.from(new Set(state.competencias.map((item) => item.ano)));
  if (anos.length === 0) return state;

  // Keep the current competence's year first so the context synchronization
  // belongs to the page that started this generation. Other years only need
  // their table read; this still completes diagnosis before any mutation.
  const anoAtual = competenciaAtual.slice(0, 4);
  anos.sort((left, right) => (left === anoAtual ? -1 : right === anoAtual ? 1 : 0));
  const snapshot: Record<string, Awaited<ReturnType<typeof fetchBoletosDoAno>>[string]> = {};
  for (const ano of anos) {
    const yearSnapshot = await fetchBoletosDoAno(
      ano,
      ano === anoAtual ? competenciaAtual : undefined,
    );
    Object.assign(snapshot, yearSnapshot);
  }
  const diagnostico: Record<string, GuiaExistenteInfo> = {};
  const plano: Record<string, GpsExecutionAction> = {};

  for (const item of state.competencias) {
    const competencia = `${item.ano}${item.mes}`;
    const boleto = snapshot[competencia] || {
      paga: false,
      emissaoUrl: null,
      valorDeclarado: 0,
      valorPago: 0,
      situacao: "",
    };
    const info: GuiaExistenteInfo = {
      paga: (boleto.valorPago ?? 0) > 0,
      emissaoUrl: boleto.emissaoUrl,
      valorDeclarado: boleto.valorDeclarado,
      valorPago: boleto.valorPago,
      situacao: boleto.situacao,
    };
    diagnostico[competencia] = info;
    plano[competencia] = classificarCompetencia(info);
  }

  const prepared = { ...state, diagnostico, plano };
  writeGpsQueueState(prepared);
  console.debug("[SIGESS] Plano interno de geração preparado:", {
    competencias: state.competencias.map((item) => {
      const competencia = `${item.ano}${item.mes}`;
      return { competencia, acao: plano[competencia], diagnostico: diagnostico[competencia] };
    }),
  });
  return prepared;
}

function markCurrentCompetenciaResult(
  status: GovBatchCompetenciaResult["status"],
  lastError?: string,
  boletoInfo?: { valorComercializado?: number; valorDeclarado?: number; valorPago?: number },
) {
  const state = readGpsQueueState();
  if (!state || !state.competencias[state.index]) return null;
  const competencia = `${state.competencias[state.index].ano}${state.competencias[state.index].mes}`;
  const result: GovBatchCompetenciaResult = {
    competencia,
    status,
    ...(lastError ? { lastError } : {}),
    ...(boletoInfo || {}),
  };
  state.resultados = [
    ...state.resultados.filter((item) => item.competencia !== competencia),
    result,
  ];
  writeGpsQueueState(state);
  return state;
}

export async function executarFluxoDiretoGps(settings: AppSettings, competencia: string) {
  const queue = readGpsQueueState();
  const queueCompetencia = queue?.competencias[queue.index];
  const valorComercializado = normalizeMoneyValue(
    queueCompetencia?.valorComercializado ?? settings.valorComercializado,
  );
  console.debug("[SIGESS] valorComercializado from tab context:", settings.valorComercializado);
  console.debug("[SIGESS] valorComercializado normalized:", valorComercializado);
  const { comercializacaoHtml, autonomosHtml } = await carregarDadosComercializacao(competencia);
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

  const enviaRemuneracoesParams = buildEnviaRemuneracoesFormData(
    competencia,
    parseHtml(enviarResp),
    parseHtml(autonomosHtml),
  );
  await executarFechamentoDireto(
    competencia,
    valorComercializado,
    enviaRemuneracoesParams,
    settings,
  );
}

async function executarFechamentoDireto(
  competencia: string,
  valorComercializado: string,
  enviaRemuneracoesParams: URLSearchParams,
  settings: AppSettings,
): Promise<void> {
  const remuneracoesMsg = esocialMessages.loadingClosureScreen();
  logger.info("eSocial", remuneracoesMsg.title);
  reportBatchStatus(remuneracoesMsg.status, remuneracoesMsg.title, remuneracoesMsg.description);

  const remuneracoesHtml = await postForm(
    `/FolhaPagamento/Listagem/EnviaRemuneracoes?competencia=${competencia}&considerarRegistrosExcluidos=true`,
    enviaRemuneracoesParams,
  );
  const remuneracoesDoc = parseHtml(remuneracoesHtml);
  console.debug("[SIGESS] EnviaRemuneracoes direto respondeu:", {
    competencia,
    htmlLength: remuneracoesHtml.length,
    finalUrl: buildEsocialUrl(`/FolhaPagamento/Listagem/EnviaRemuneracoes?competencia=${competencia}`),
    hasForm: !!remuneracoesDoc.querySelector("form"),
  });

  let fechamentoHtml = remuneracoesHtml;
  let fechamentoDoc = remuneracoesDoc;
  if (!fechamentoDoc.querySelector("form")) {
    fechamentoHtml = await carregarTelaFechamento(competencia);
    fechamentoDoc = parseHtml(fechamentoHtml);
  }

  const fechamentoForm = buildFechamentoFormData(fechamentoDoc, competencia);
  const closingMsg = esocialMessages.closingPayroll();
  logger.info("eSocial", closingMsg.title);
  reportBatchStatus(closingMsg.status, closingMsg.title, closingMsg.description);

  const fechamentoPostHtml = await postForm(
    `/FolhaPagamento/FechamentoFolha?competencia=${competencia}`,
    fechamentoForm,
  );
  const fechamentoPostDoc = parseHtml(fechamentoPostHtml);
  const fechamentoHtmlError =
    extractHtmlAlertMessage(fechamentoPostDoc) || extractHtmlAlertMessageFromHtml(fechamentoPostHtml);

  console.debug("[SIGESS] Fechamento direto respondeu:", {
    competencia,
    htmlLength: fechamentoPostHtml.length,
    hasTabsResumo: !!fechamentoPostDoc.querySelector("#tabs-resumo"),
    hasEmitirGuia: !!fechamentoPostDoc.querySelector("#btn-emitir-guia"),
    hasAlertSuccess: !!fechamentoPostDoc.querySelector(".alert-success"),
    hasAlertDanger: !!fechamentoPostDoc.querySelector(".alert-danger, .alert-error"),
  });

  if (fechamentoHtmlError) {
    throw new Error(fechamentoHtmlError);
  }

  const { guiaUrl, guiaAposFechamento, fechamentoConfirmado } = await aguardarGuiaAposFechamento(
    fechamentoPostDoc,
    competencia,
  );
  if (!guiaUrl || (!fechamentoConfirmado && (guiaAposFechamento.valorDeclarado ?? 0) <= 0)) {
    throw new Error("A folha não foi fechada com guia confirmada após o POST de fechamento.");
  }

  await baixarGuiaPdfDirecto(
    guiaUrl,
    competencia,
    true,
    {
      valorComercializado: Number.parseFloat(valorComercializado.replace(",", ".")) || undefined,
      valorDeclarado: guiaAposFechamento.valorDeclarado,
      valorPago: guiaAposFechamento.valorPago,
    },
  );

  await advanceGpsQueueAfterCompletion(
    settings,
    competencia,
    "concluido",
    {
      valorComercializado: Number.parseFloat(valorComercializado.replace(",", ".")) || undefined,
      valorDeclarado: guiaAposFechamento.valorDeclarado,
      valorPago: guiaAposFechamento.valorPago,
    },
  );
}
/*

  const fechamentoScreenFromRemuneracoes = await enviarRemuneracoes(
    competencia,
    parseHtml(enviarResp),
    parseHtml(autonomosHtml),
  );

  const verificacaoTexto = fechamentoScreenFromRemuneracoes ? null : await verificarAcessoFechamento(competencia);
  if (verificacaoTexto) {
    const verificacao = safeParseJson<{ Sucesso?: boolean }>(verificacaoTexto);
    if (verificacao && verificacao.Sucesso === false) {
      throw new Error("O eSocial não liberou o fechamento da folha.");
    }
  }

  const closureScreenMsg = esocialMessages.loadingClosureScreen();
  logger.info("eSocial", closureScreenMsg.title);
  reportBatchStatus(closureScreenMsg.status, closureScreenMsg.title, closureScreenMsg.description);

  let fechamentoGetHtml = fechamentoScreenFromRemuneracoes;
  if (!fechamentoGetHtml) {
    fechamentoGetHtml = await carregarTelaFechamento(competencia);
  } else {
    console.debug("[SIGESS] Reaproveitando tela de fechamento retornada por EnviaRemuneracoes");
  }
  const fechamentoGetDoc = parseHtml(fechamentoGetHtml);
  console.debug("[SIGESS] Campos da tela de fechamento:", snapshotFormFields(fechamentoGetDoc));

  const closingMsgLegacy = esocialMessages.closingPayroll();
  logger.info("eSocial", closingMsgLegacy.title);
  reportBatchStatus(closingMsgLegacy.status, closingMsgLegacy.title, closingMsgLegacy.description);

  setPendingGpsClosureState({
    competencia,
    valorComercializado,
    step: "awaiting_closure_page",
  });

  const fechamentoUrl = buildEsocialUrl(`/FolhaPagamento/FechamentoFolha?competencia=${competencia}`);
  if (window.location.href !== fechamentoUrl) {
    console.debug("[SIGESS] Navegando para tela real de fechamento:", fechamentoUrl);
    window.location.href = fechamentoUrl;
    return;
  }

  submitNativeFechamentoForm(document, competencia);
  return;

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
  console.debug("[SIGESS] Fechamento POST markers:", {
    competencia,
    hasTabsResumo: !!fechamentoPostDoc.querySelector("#tabs-resumo"),
    hasEmitirGuia: !!fechamentoPostDoc.querySelector("#btn-emitir-guia"),
    hasAlertSuccess: !!fechamentoPostDoc.querySelector(".alert-success"),
    hasAlertDanger: !!fechamentoPostDoc.querySelector(".alert-danger, .alert-error"),
    containsEncerradaSucesso: /Folha de pagamento encerrada com sucesso/i.test(fechamentoPostHtml),
    containsEmEdicao: /Em edi[cç][aã]o/i.test(fechamentoPostHtml),
    containsEncerrado: /Encerrado/i.test(fechamentoPostHtml),
    htmlLength: fechamentoPostHtml.length,
  });
  const fechamentoHtmlError =
    extractHtmlAlertMessage(fechamentoPostDoc) || extractHtmlAlertMessageFromHtml(fechamentoPostHtml);
  if (fechamentoHtmlError) {
    console.warn("[SIGESS] Mensagem de erro no fechamento:", fechamentoHtmlError);
    console.warn("[SIGESS] Campos retornados apos erro no fechamento:", snapshotFormFields(fechamentoPostDoc));
  }
  const { guiaUrl, guiaAposFechamento, fechamentoConfirmado } = await aguardarGuiaAposFechamento(
    fechamentoPostDoc,
    competencia,
  );

  if (!guiaUrl || (!fechamentoConfirmado && (guiaAposFechamento.valorDeclarado ?? 0) <= 0)) {
    console.warn("[SIGESS] Fechamento sem guia confirmada apos POST:", {
      guiaUrl,
      guiaAposFechamento,
      fechamentoConfirmado,
      fechamentoHtmlError,
      preview: fechamentoPostHtml.slice(0, 1200),
    });
    console.warn("[SIGESS DEBUG] fechamentoPostHtml preview:", fechamentoPostHtml.slice(0, 4000));
    throw new Error(
      fechamentoHtmlError || "A folha nao foi fechada com guia confirmada apos o POST de fechamento.",
    );
  }

  await baixarGuiaPdfDirecto(
    guiaUrl!,
    competencia,
    true,
    {
      valorDeclarado: guiaAposFechamento.valorDeclarado,
      valorPago: guiaAposFechamento.valorPago,
    },
  );

  sessionStorage.setItem(`${GPS_FLOW_DONE_PREFIX}${competencia}`, "true");
  showSuccessModal("Boleto Gerado!");
}

*/
async function carregarDadosComercializacao(competencia: string): Promise<{
  comercializacaoHtml: string;
  autonomosHtml: string;
}> {
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

  const [comercializacaoResponse, autonomosResponse] = await Promise.all([
    comercializacaoPromise,
    autonomosPromise,
  ]);

  if (!comercializacaoResponse?.ok) {
    throw new Error("Nao foi possivel carregar a comercializacao da competencia.");
  }

  if (!autonomosResponse?.ok) {
    throw new Error("Nao foi possivel carregar os pagamentos de autonomos da competencia.");
  }

  return {
    comercializacaoHtml: await comercializacaoResponse.text(),
    autonomosHtml: await autonomosResponse.text(),
  };
}

async function postForm(path: string, params: URLSearchParams): Promise<string> {
  const response = await fetch(buildEsocialUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const text = await response.text();
  console.debug("[SIGESS] POST direto:", {
    path,
    status: response.status,
    finalUrl: response.url,
    htmlLength: text.length,
  });

  if (!response.ok) {
    throw new Error(`Falha no POST ${path}: HTTP ${response.status}`);
  }

  return text;
}

export async function verificarAcessoFechamento(competencia: string) {
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

export function buildFechamentoFormData(doc: Document, competencia: string): URLSearchParams {
  const form = doc.querySelector("form");
  console.debug("[SIGESS] Form encontrado:", !!form);

  if (!form) {
    throw new Error("Nao foi possivel localizar o formulario de fechamento da folha.");
  }

  const params = new URLSearchParams();
  appendNamedElements(params, form.querySelectorAll("input[name], select[name], textarea[name]"));

  ensureParam(
    params,
    "PeriodoApuracao",
    `${competencia.slice(0, 4)}-${competencia.slice(4, 6)}`,
  );
  ensureParam(params, "Competencia", competencia);
  ensureParam(params, "ProximoPasso", "");
  ensureParam(params, "IndicatorApuracao", "1");
  ensureParam(params, "DataPagamento", "01/01/0001 00:00:00");
  ensureParam(
    params,
    "UrlRetorno",
    `/portal/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`,
  );
  replaceParamValues(params, "HabilitaEmissaoGuia", "True");
  replaceParamValues(params, "TipoEmpregador", "EMPREGADOR_DOMESTICO");
  replaceParamValues(params, "FechamentoFolha.EhSeguradoEspecial", "True");
  replaceParamValues(params, "IndicadorTipoGuia", "1");
  replaceParamValues(params, "download", "False");
  replaceParamValues(params, "commandName", "confirmar");

  console.debug("[SIGESS] Fechamento campos serializados:", Array.from(new Set(
    Array.from(form.querySelectorAll("input[name], select[name], textarea[name]"))
      .map((element) => element.getAttribute("name") || "")
      .filter(Boolean),
  )));

  console.debug("[SIGESS] Fechamento FormData final:", Array.from(params.entries()));
  console.debug("[SIGESS] Fechamento FormData body:", params.toString());
  return params;
}

async function aguardarGuiaAposFechamento(
  fechamentoPostDoc: Document,
  competencia: string,
): Promise<{
  guiaUrl: string | null;
  guiaAposFechamento: GuiaExistenteInfo;
  fechamentoConfirmado: boolean;
}> {
  let guiaUrl = resolveGuiaUrlFromDocument(fechamentoPostDoc, competencia);
  const valorResumo = extractValorResumoDoFechamento(fechamentoPostDoc);
  const fechamentoConfirmadoNoHtml = hasFechamentoConfirmadoNoHtml(fechamentoPostDoc);
  let guiaAposFechamento = await consultarGuiaExistenteViaApi(competencia);

  if (!guiaUrl && guiaAposFechamento.emissaoUrl && (guiaAposFechamento.valorDeclarado ?? 0) > 0) {
    guiaUrl = guiaAposFechamento.emissaoUrl;
  }

  if (guiaUrl && fechamentoConfirmadoNoHtml) {
    return {
      guiaUrl,
      guiaAposFechamento: {
        ...guiaAposFechamento,
        emissaoUrl: guiaUrl,
        valorDeclarado: valorResumo ?? guiaAposFechamento.valorDeclarado,
      },
      fechamentoConfirmado: true,
    };
  }

  if (guiaUrl && (guiaAposFechamento.valorDeclarado ?? 0) > 0) {
    return { guiaUrl, guiaAposFechamento, fechamentoConfirmado: true };
  }

  for (let attempt = 1; attempt <= 8; attempt += 1) {
    await delay(1500);
    guiaAposFechamento = await consultarGuiaExistenteViaApi(competencia);

    console.debug("[SIGESS] Aguardando guia apos fechamento:", {
      competencia,
      attempt,
      valorDeclarado: guiaAposFechamento.valorDeclarado,
      valorPago: guiaAposFechamento.valorPago,
      emissaoUrl: guiaAposFechamento.emissaoUrl,
    });

    if (
      guiaAposFechamento.emissaoUrl &&
      (guiaAposFechamento.valorDeclarado ?? 0) > 0
    ) {
      return {
        guiaUrl: guiaAposFechamento.emissaoUrl,
        guiaAposFechamento,
        fechamentoConfirmado: true,
      };
    }
  }

  return { guiaUrl, guiaAposFechamento, fechamentoConfirmado: false };
}

function hasFechamentoConfirmadoNoHtml(doc: Document): boolean {
  const html = doc.documentElement?.outerHTML || "";

  return (
    /Folha de pagamento encerrada com sucesso/i.test(html) ||
    !!doc.querySelector("#btn-emitir-guia") ||
    !!doc.querySelector("#tabs-resumo")
  );
}

function extractValorResumoDoFechamento(doc: Document): number | undefined {
  const totalText =
    doc.querySelector("#TotalValoresRecolhido")?.parentElement?.textContent ||
    Array.from(doc.querySelectorAll("#tabs-resumo td"))
      .map((cell) => cell.textContent || "")
      .find((text) => /total/i.test(text) && /R\$\s*[\d.,]+/.test(text)) ||
    "";

  const values = extractMoneyValues(totalText);
  return values.find((value) => value > 0);
}

function extractHtmlAlertMessage(doc: Document): string | null {
  const alert = doc.querySelector(".alert-danger, .alert-error") as HTMLElement | null;
  if (!alert) {
    return null;
  }

  const listItems = Array.from(alert.querySelectorAll("li"))
    .map((li) => (li.textContent || "").trim())
    .filter(Boolean);

  if (listItems.length > 0) {
    return listItems.join(" | ");
  }

  const text = (alert.textContent || "")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

function extractHtmlAlertMessageFromHtml(html: string): string | null {
  const match = html.match(
    /<div[^>]+class="[^"]*(?:alert-danger|alert-error)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
  );
  if (!match) {
    return null;
  }

  const text = match[1]
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  return text || null;
}

function snapshotFormFields(doc: Document) {
  return Array.from(doc.querySelectorAll("input[name], select[name], textarea[name]"))
    .map((rawElement) => {
      const element = rawElement as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
      const base = {
        name: element.getAttribute("name") || "",
        id: element.id || "",
        tag: element.tagName.toLowerCase(),
        value: element.value ?? "",
      };

      if (element instanceof HTMLInputElement) {
        return {
          ...base,
          type: element.type,
          checked: element.checked,
        };
      }

      return base;
    });
}

function getPendingGpsClosureState(): PendingGpsClosureState | null {
  try {
    const raw = sessionStorage.getItem(GPS_FLOW_PENDING_STATE_KEY);
    return raw ? (JSON.parse(raw) as PendingGpsClosureState) : null;
  } catch {
    return null;
  }
}

function setPendingGpsClosureState(state: PendingGpsClosureState) {
  sessionStorage.setItem(GPS_FLOW_PENDING_STATE_KEY, JSON.stringify(state));
}

function clearPendingGpsClosureState() {
  sessionStorage.removeItem(GPS_FLOW_PENDING_STATE_KEY);
}

function isTransientDctfValidationError(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.includes("dctf web")
    && normalized.includes("aguarde alguns instantes")
    && normalized.includes("gerar a guia");
}

function isPayrollClosedInContext(doc: Document, competencia: string): boolean {
  const statusInput = doc.querySelector<HTMLInputElement>(
    "#SituacaoFolha, input[name='SituacaoFolha']",
  );
  const status = statusInput?.value?.trim() || "";
  if (status === "4") {
    console.debug("[SIGESS] Contexto indica folha encerrada pelo estado nativo:", {
      competencia,
      situacaoFolha: status,
    });
    return true;
  }

  const reaberturaControl = Array.from(doc.querySelectorAll("a, button"))
    .find((element) => {
      const text = (element.textContent || "").replace(/\s+/g, " ").trim();
      const onclick = element.getAttribute("onclick") || "";
      return /reabrir m[eê]s/i.test(text) || /Reabertura/i.test(onclick);
    });
  if (reaberturaControl) {
    console.debug("[SIGESS] Contexto indica folha encerrada pelo controle de reabertura:", {
      competencia,
      controle: reaberturaControl.textContent?.trim() || reaberturaControl.tagName,
    });
    return true;
  }

  const closedControl = doc.querySelector(
    ".encerrar-folha[disabled], #btn-encerrar-mes[disabled]",
  );
  if (closedControl) {
    console.debug("[SIGESS] Contexto indica folha encerrada pelo botão nativo desabilitado:", {
      competencia,
    });
    return true;
  }

  const bodyText = (doc.body?.textContent || "").replace(/\s+/g, " ");
  return /folha(?: de pagamento)?\s+(?:está\s+)?(?:encerrada|fechada)/i.test(bodyText)
    || /folha encerrada/i.test(bodyText);
}

function iniciarReaberturaDaCompetencia(
  settings: AppSettings,
  competencia: string,
  valorComercializado: string,
  state: GpsQueueState,
) {
  const reopenMsg = esocialMessages.reopeningCompetencia(competenciaLabel(competencia));
  reportBatchStatus(reopenMsg.status, reopenMsg.title, reopenMsg.description, {
    ...queueStatusExtra(state, competencia),
    overlayState: {
      step: state.index + 1,
      total: state.competencias.length,
      title: reopenMsg.title,
      description: reopenMsg.description,
    },
  });

  setPendingGpsClosureState({
    competencia,
    valorComercializado,
    competenciaIndex: state.index,
    step: "awaiting_reopen_page",
  });

  const reaberturaUrl = buildEsocialUrl(`/FolhaPagamento/Remuneracao/Reabertura?competencia=${competencia}`);
  console.debug("[SIGESS] Navegando para reabrir a competência antes da geração:", {
    reaberturaUrl,
    competencia,
    selectedYear: settings.selectedYear,
    selectedMonth: settings.selectedMonth,
  });
  window.location.href = reaberturaUrl;
}

async function advanceGpsQueueAfterCompletion(
  settings: AppSettings | undefined,
  competencia: string,
  resultStatus: GovBatchCompetenciaResult["status"],
  boletoInfo?: { valorComercializado?: number; valorDeclarado?: number; valorPago?: number },
): Promise<void> {
  sessionStorage.setItem(`${GPS_FLOW_DONE_PREFIX}${competencia}`, "true");
  const state = markCurrentCompetenciaResult(resultStatus, undefined, boletoInfo);
  if (!state || state.index >= state.competencias.length - 1) {
    clearGpsQueueState();
    releaseGpsFlowLock();
    const finalMsg = esocialMessages.allCompetenciasCompleted(state?.resultados.length || 1);
    reportBatchStatus(finalMsg.status, finalMsg.title, finalMsg.description, {
      boletoInfo: boletoInfo ? { detectado: true, competencia, ...boletoInfo } : undefined,
      competenciaAtual: competencia,
      competenciaIndice: state?.competencias.length || 1,
      competenciasTotal: state?.competencias.length || 1,
      competenciasResultados: state?.resultados,
      overlayState: null,
    });
    showSuccessModal("Geração concluída");
    return;
  }

  const completedMsg = esocialMessages.competenciaConcluida(
    competencia,
    state.index + 1,
    state.competencias.length,
  );
  reportBatchStatus(completedMsg.status, completedMsg.title, completedMsg.description, {
    ...queueStatusExtra(state, competencia),
    boletoInfo: boletoInfo ? { detectado: true, competencia, ...boletoInfo } : undefined,
    overlayState: {
      step: state.index + 1,
      total: state.competencias.length,
      title: completedMsg.title,
      description: completedMsg.description,
    },
  });

  // Keep the completion checkpoint observable by the Web before the next
  // navigation overwrites the current status.
  await new Promise<void>((resolve) => window.setTimeout(resolve, 800));

  state.index += 1;
  writeGpsQueueState(state);
  const next = state.competencias[state.index];
  const nextCompetencia = `${next.ano}${next.mes}`;
  const nextSettings: AppSettings = {
    ...(settings || {}),
    gerarGps: true,
    consultarGuias: false,
    selectedYear: next.ano,
    selectedMonth: next.mes,
    valorComercializado: next.valorComercializado,
    competencias: state.competencias,
  } as AppSettings;
  const nextMsg = esocialMessages.startingCompetencia(
    competenciaLabel(nextCompetencia),
    state.index + 1,
    state.competencias.length,
  );
  reportBatchStatus(nextMsg.status, nextMsg.title, nextMsg.description, {
    ...queueStatusExtra(state, nextCompetencia),
    boletoInfo: boletoInfo ? { detectado: true, competencia, ...boletoInfo } : undefined,
    overlayState: {
      step: state.index + 1,
      total: state.competencias.length,
      title: nextMsg.title,
      description: nextMsg.description,
    },
  });
  releaseGpsFlowLock();
  if (acquireGpsFlowLock(nextCompetencia)) {
    await executarFluxoDirectoFromHome(nextSettings);
  }
}

function submitNativeFechamentoForm(doc: Document, competencia: string) {
  const form = doc.querySelector("form") as HTMLFormElement | null;
  if (!form) {
    throw new Error("Nao foi possivel localizar o formulario real de fechamento.");
  }

  forceInputValue(form, "HabilitaEmissaoGuia", "True");
  forceInputValue(form, "FechamentoFolha.EhSeguradoEspecial", "True");
  forceInputValue(form, "IndicadorTipoGuia", "1");
  forceInputValue(form, "Competencia", competencia);
  forceInputValue(form, "PeriodoApuracao", `${competencia.slice(0, 4)}-${competencia.slice(4, 6)}`);
  forceInputValue(form, "download", "False");

  const commandInput = doc.createElement("input");
  commandInput.type = "hidden";
  commandInput.name = "commandName";
  commandInput.value = "confirmar";
  form.appendChild(commandInput);

  const currentState = getPendingGpsClosureState();
  setPendingGpsClosureState({
    competencia,
    valorComercializado: currentState?.valorComercializado,
    enviaRemuneracoesBody: currentState?.enviaRemuneracoesBody,
    listagemNavigationStartedAt: currentState?.listagemNavigationStartedAt,
    fechamentoNavigationStartedAt: currentState?.fechamentoNavigationStartedAt,
    fechamentoSubmittedAt: Date.now(),
    competenciaIndex: currentState?.competenciaIndex,
    fechamentoRetryCount: currentState?.fechamentoRetryCount,
    step: "awaiting_closure_result",
  });

  console.debug("[SIGESS] Submetendo formulario real de fechamento");
  form.submit();
}

function submitNativeEnviaRemuneracoes(
  params: URLSearchParams,
  competencia: string,
  valorComercializado: string,
) {
  const form = document.createElement("form");
  form.method = "POST";
  form.action = buildEsocialUrl(
    `/FolhaPagamento/Listagem/EnviaRemuneracoes?competencia=${competencia}&considerarRegistrosExcluidos=true`,
  );
  form.style.display = "none";

  params.forEach((value, name) => {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
  });

  document.body.appendChild(form);
  const currentState = getPendingGpsClosureState();
  setPendingGpsClosureState({
    competencia,
    valorComercializado,
    enviaRemuneracoesBody: params.toString(),
    listagemNavigationStartedAt: currentState?.listagemNavigationStartedAt,
    fechamentoNavigationStartedAt: Date.now(),
    competenciaIndex: currentState?.competenciaIndex,
    fechamentoRetryCount: currentState?.fechamentoRetryCount,
    step: "awaiting_closure_page",
  });

  console.debug("[SIGESS] Submetendo formulario real de EnviaRemuneracoes");
  console.debug("[SIGESS] EnviaRemuneracoes body:", params.toString());
  form.submit();
}

function forceInputValue(form: HTMLFormElement, name: string, value: string) {
  const inputs = Array.from(form.querySelectorAll(`[name="${CSS.escape(name)}"]`)) as HTMLInputElement[];
  if (inputs.length === 0) {
    const input = document.createElement("input");
    input.type = "hidden";
    input.name = name;
    input.value = value;
    form.appendChild(input);
    return;
  }

  for (const input of inputs) {
    input.value = value;
  }
}

function normalizeMoneyValue(value: string): string {
  const trimmed = String(value || "").trim();
  return trimmed || "0";
}

export function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

export async function enviarRemuneracoes(
  competencia: string,
  comercializacaoDoc: Document,
  autonomosDoc: Document,
): Promise<string> {
  const path = `/FolhaPagamento/Listagem/EnviaRemuneracoes?competencia=${competencia}&considerarRegistrosExcluidos=true`;
  const params = buildEnviaRemuneracoesFormData(competencia, comercializacaoDoc, autonomosDoc);

  console.debug("[SIGESS] POST", path);
  console.debug("[SIGESS] EnviaRemuneracoes body:", params.toString());

  const response = await fetch(buildEsocialUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const text = await response.text();
  console.debug("[SIGESS] EnviaRemuneracoes status:", response.status);
  console.debug("[SIGESS] EnviaRemuneracoes final URL:", response.url);
  console.debug("[SIGESS] EnviaRemuneracoes preview:", text.slice(0, 1200));

  if (!response.ok) {
    throw new Error(`Falha ao enviar remuneracoes: HTTP ${response.status}`);
  }

  return text;
}

export async function carregarTelaFechamento(competencia: string): Promise<string> {
  const response = await fetch(
    buildEsocialUrl(`/FolhaPagamento/FechamentoFolha?competencia=${competencia}`),
    {
      method: "GET",
      credentials: "include",
    },
  );

  if (!response.ok) {
    throw new Error(`Falha ao carregar fechamento: HTTP ${response.status}`);
  }

  return response.text();
}

function buildEnviaRemuneracoesFormData(
  competencia: string,
  comercializacaoDoc: Document,
  autonomosDoc: Document,
): URLSearchParams {
  const params = new URLSearchParams();
  params.set("Competencia", competencia);
  appendNamedElements(params, comercializacaoDoc.querySelectorAll("input[name], select[name], textarea[name]"));
  appendNamedElements(params, autonomosDoc.querySelectorAll("input[name], select[name], textarea[name]"));
  params.set("MostrarMensagem13", "false");
  return params;
}

function appendNamedElements(
  params: URLSearchParams,
  elements: NodeListOf<Element>,
) {
  for (const rawElement of Array.from(elements)) {
    const element = rawElement as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
    const name = element.getAttribute("name");
    if (!name) {
      continue;
    }

    if (
      element instanceof HTMLInputElement &&
      ["submit", "button", "reset", "file", "image"].includes(element.type)
    ) {
      continue;
    }

    if (
      element instanceof HTMLInputElement &&
      (element.type === "checkbox" || element.type === "radio")
    ) {
      if (element.checked) {
        params.append(name, element.value || "true");
      }
      continue;
    }

    params.append(name, element.value ?? "");
  }
}

function ensureParam(params: URLSearchParams, name: string, value: string) {
  if (!params.has(name)) {
    params.append(name, value);
  }
}

function replaceParamValues(params: URLSearchParams, name: string, value: string) {
  const existingValues = params.getAll(name);
  params.delete(name);

  if (existingValues.length === 0) {
    params.append(name, value);
    return;
  }

  for (let index = 0; index < existingValues.length; index += 1) {
    params.append(name, value);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDocumentBody(): Promise<void> {
  if (document.body) return;

  await new Promise<void>((resolve) => {
    const observer = new MutationObserver(() => {
      if (!document.body) return;
      observer.disconnect();
      resolve();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  });
}

async function waitForDocumentReady(): Promise<void> {
  if (document.readyState !== "loading") return;
  await new Promise<void>((resolve) => {
    document.addEventListener("DOMContentLoaded", () => resolve(), { once: true });
  });
}

async function waitForNativeFechamentoForm(doc: Document): Promise<void> {
  if (doc.querySelector("form")) return;

  await new Promise<void>((resolve, reject) => {
    const observer = new MutationObserver(() => {
      if (!doc.querySelector("form")) return;
      observer.disconnect();
      clearTimeout(timeoutId);
      resolve();
    });
    const timeoutId = window.setTimeout(() => {
      observer.disconnect();
      reject(new Error("Nao foi possivel localizar o formulario real de fechamento."));
    }, 15000);
    observer.observe(doc.documentElement, { childList: true, subtree: true });
  });
}

function logGpsNavigationTiming(step: string, startedAt: number | undefined, competencia: string) {
  if (!startedAt) return;
  console.info("[SIGESS] Tempo de navegacao do eSocial:", {
    step,
    competencia,
    durationMs: Date.now() - startedAt,
  });
}

export async function resumePendingGpsFlow(settings?: AppSettings): Promise<boolean> {
  const pending = getPendingGpsClosureState();
  if (!pending) {
    return false;
  }

  const currentCompetencia =
    extractCompetenciaFromUrl(window.location.href) || extractCompetenciaFromDom();
  if (!currentCompetencia || currentCompetencia !== pending.competencia) {
    return false;
  }

  if (pending.step === "awaiting_generation_context_page") {
    if (!window.location.href.includes("/FolhaPagamento/Listagem/ListarPagamentos")) {
      return true;
    }

    await waitForDocumentReady();
    await waitForDocumentBody();
    clearPendingGpsClosureState();
    console.debug("[SIGESS] Contexto de ListarPagamentos pronto; iniciando geração direta:", {
      competencia: pending.competencia,
    });
    if (!settings) {
      throw new Error("Não foi possível retomar a geração após abrir ListarPagamentos.");
    }
    await executarFluxoDirectoFromHome(settings);
    return true;
  }

  if (pending.step === "awaiting_reopen_page") {
    if (!window.location.href.includes("/FolhaPagamento/Listagem/ListarPagamentos")) {
      // Reabertura redirects to ListarPagamentos after the portal changes the
      // native payroll state. Keep the pending state while that redirect is in
      // progress and do not start a second flow.
      return true;
    }

    await waitForDocumentReady();
    await waitForDocumentBody();
    clearPendingGpsClosureState();
    console.debug("[SIGESS] Contexto nativo de reabertura pronto; retomando geração:", {
      competencia: pending.competencia,
    });
    if (!settings) {
      throw new Error("Não foi possível retomar a geração após reabrir a competência.");
    }
    try {
      await executarFluxoDiretoGps(settings, pending.competencia);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const queueAfterError = markCurrentCompetenciaResult("erro", errorMessage);
      clearGpsQueueState();
      releaseGpsFlowLock();
      const statusMsg = errorMessage.includes("já foi fechada")
        ? esocialMessages.payrollAlreadyClosed(pending.competencia)
        : esocialMessages.failedToGenerateGuide();
      logger.error("eSocial", statusMsg.title, { error: errorMessage });
      reportBatchStatus(statusMsg.status, statusMsg.title, statusMsg.description, {
        lastError: errorMessage,
        ...(queueAfterError ? queueStatusExtra(queueAfterError, pending.competencia) : {}),
        overlayState: null,
      });
    }
    return true;
  }

  if (pending.step === "awaiting_remuneracoes_page") {
    if (!window.location.href.includes("/FolhaPagamento/Listagem/ListarPagamentos")) {
      return false;
    }

    const body = pending.enviaRemuneracoesBody || "";
    if (!body) {
      clearPendingGpsClosureState();
      releaseGpsFlowLock();
      throw new Error("Nao foi possivel retomar o EnviaRemuneracoes: corpo pendente ausente.");
    }

    // Preserve the rendered-page context before submitting the native form.
    // The optimization previously submitted as soon as <body> existed,
    // which could precede the portal's normal document initialization.
    await waitForDocumentReady();
    await waitForDocumentBody();
    logGpsNavigationTiming("ListarPagamentos pronto", pending.listagemNavigationStartedAt, pending.competencia);
    console.debug("[SIGESS] Retomando EnviaRemuneracoes a partir da tela real de ListarPagamentos");
    submitNativeEnviaRemuneracoes(
      new URLSearchParams(body),
      pending.competencia,
      pending.valorComercializado || "0",
    );
    return true;
  }

  if (!window.location.href.includes("FechamentoFolha")) {
    return false;
  }

  if (pending.step === "awaiting_closure_page") {
    // A form appearing in the DOM is not sufficient evidence that the
    // eSocial page finished its normal navigation lifecycle.
    await waitForDocumentReady();
    await waitForNativeFechamentoForm(document);
    logGpsNavigationTiming("FechamentoFolha pronto", pending.fechamentoNavigationStartedAt, pending.competencia);
    console.debug("[SIGESS] Campos da tela de fechamento:", snapshotFormFields(document));
    submitNativeFechamentoForm(document, pending.competencia);
    return true;
  }

  await waitForDocumentReady();
  const fechamentoHtml = document.documentElement?.outerHTML || "";
  const fechamentoDoc = document;
  logGpsNavigationTiming("FechamentoFolha respondeu", pending.fechamentoSubmittedAt, pending.competencia);
  console.debug("[SIGESS] Fechamento POST markers:", {
    competencia: pending.competencia,
    hasTabsResumo: !!fechamentoDoc.querySelector("#tabs-resumo"),
    hasEmitirGuia: !!fechamentoDoc.querySelector("#btn-emitir-guia"),
    hasAlertSuccess: !!fechamentoDoc.querySelector(".alert-success"),
    hasAlertDanger: !!fechamentoDoc.querySelector(".alert-danger, .alert-error"),
    containsEncerradaSucesso: /Folha de pagamento encerrada com sucesso/i.test(fechamentoHtml),
    containsEmEdicao: /Em edi[cÃ§][aÃ£]o/i.test(fechamentoHtml),
    containsEncerrado: /Encerrado/i.test(fechamentoHtml),
    htmlLength: fechamentoHtml.length,
  });

  const fechamentoHtmlError =
    extractHtmlAlertMessage(fechamentoDoc) || extractHtmlAlertMessageFromHtml(fechamentoHtml);
  if (fechamentoHtmlError) {
    console.warn("[SIGESS] Mensagem de erro no fechamento:", fechamentoHtmlError);
    console.warn("[SIGESS] Campos retornados apos erro no fechamento:", snapshotFormFields(fechamentoDoc));

    const retryCount = pending.fechamentoRetryCount || 0;
    if (retryCount < 1 && isTransientDctfValidationError(fechamentoHtmlError)) {
      const queueForRetry = readGpsQueueState();
      const retryMsg = esocialMessages.retryingGuideGeneration(pending.competencia);
      setPendingGpsClosureState({
        ...pending,
        fechamentoRetryCount: retryCount + 1,
        fechamentoNavigationStartedAt: Date.now(),
        step: "awaiting_closure_page",
      });
      reportBatchStatus(retryMsg.status, retryMsg.title, retryMsg.description, {
        ...(queueForRetry ? queueStatusExtra(queueForRetry, pending.competencia) : {}),
        overlayState: {
          step: queueForRetry ? queueForRetry.index + 1 : 1,
          total: queueForRetry?.competencias.length || 1,
          title: retryMsg.title,
          description: retryMsg.description,
        },
      });
      window.setTimeout(() => {
        window.location.href = buildEsocialUrl(
          `/FolhaPagamento/FechamentoFolha?competencia=${pending.competencia}`,
        );
      }, 5000);
      return true;
    }

    clearPendingGpsClosureState();
    releaseGpsFlowLock();
    const queueAfterError = markCurrentCompetenciaResult("erro", fechamentoHtmlError);
    clearGpsQueueState();

    const statusMsg = esocialMessages.failedToGenerateGuide();
    logger.error("eSocial", statusMsg.title, { error: fechamentoHtmlError });
    reportBatchStatus(statusMsg.status, statusMsg.title, statusMsg.description, {
      lastError: fechamentoHtmlError,
      ...(queueAfterError ? queueStatusExtra(queueAfterError, pending.competencia) : {}),
      overlayState: null,
    });
    return true;
  }

  const { guiaUrl, guiaAposFechamento, fechamentoConfirmado } = await aguardarGuiaAposFechamento(
    fechamentoDoc,
    pending.competencia,
  );

  if (!guiaUrl || (!fechamentoConfirmado && (guiaAposFechamento.valorDeclarado ?? 0) <= 0)) {
    console.warn("[SIGESS] Fechamento sem guia confirmada apos POST:", {
      guiaUrl,
      guiaAposFechamento,
      fechamentoConfirmado,
      preview: fechamentoHtml.slice(0, 1200),
    });
    return true;
  }

  await baixarGuiaPdfDirecto(
    guiaUrl!,
    pending.competencia,
    true,
    {
      valorComercializado: pending.valorComercializado ? Number.parseFloat(pending.valorComercializado.replace(".", "").replace(",", ".")) : undefined,
      valorDeclarado: guiaAposFechamento.valorDeclarado,
      valorPago: guiaAposFechamento.valorPago,
    },
  );

    clearPendingGpsClosureState();
    await advanceGpsQueueAfterCompletion(
      settings,
      pending.competencia,
      "concluido",
      {
        valorComercializado: pending.valorComercializado
          ? Number.parseFloat(pending.valorComercializado.replace(".", "").replace(",", "."))
          : undefined,
        valorDeclarado: guiaAposFechamento.valorDeclarado,
        valorPago: guiaAposFechamento.valorPago,
      },
    );
    return true;
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
  situacao?: string;
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
  const ano = settings.selectedYear === "current" || !settings.selectedYear
    ? String(anoAtual)
    : settings.selectedYear;
  const mes = (settings.selectedMonth || "").padStart(2, "0");
  if (!/^\d{4}$/.test(ano) || !/^\d{2}$/.test(mes)) return null;
  return `${ano}${mes}`;
}

export async function consultarGuiaExistenteViaApi(competencia: string): Promise<GuiaExistenteInfo> {
  try {
    const boletoData = await fetchBoletoData(competencia);
    const hasPaidValue = (boletoData.valorPago ?? 0) > 0;

    console.debug("[SIGESS] Verificacao de guia existente via fetchBoletoData:", {
      competencia,
      valorDeclarado: boletoData.valorDeclarado,
      valorPago: boletoData.valorPago,
      hasPaidValue,
      emissaoUrl: boletoData.emissaoUrl,
    });

    return {
      paga: hasPaidValue,
      emissaoUrl: boletoData.emissaoUrl,
      valorDeclarado: boletoData.valorDeclarado,
      valorPago: boletoData.valorPago,
      situacao: boletoData.situacao,
    };
  } catch (error) {
    console.debug("[SIGESS] Falha ao verificar guia existente via API:", error);
    return { paga: false, emissaoUrl: null };
  }
}

function hasGuiaEmitida(info: GuiaExistenteInfo): boolean {
  return (
    (info.valorDeclarado ?? 0) > 0 ||
    (info.valorPago ?? 0) > 0
  );
}

export async function extrairValorTotalComercializadoDaPagina(competencia: string): Promise<number> {
  try {
    const comercializacaoData = await fetchComercializacaoData(competencia);
    console.debug("[SIGESS] Valor total comercializado extraído:", comercializacaoData.valorComercializado);
    return comercializacaoData.valorComercializado;
  } catch (error) {
    console.debug("[SIGESS] Erro ao extrair valor total da comercialização:", error);
    return 0;
  }
}

export async function executarFluxoDirectoFromHome(settings: AppSettings): Promise<void> {
  const queue = initializeGpsQueue(settings);
  let activeQueue = markCurrentCompetenciaResult("processando") || queue;
  const planned = queue.competencias[queue.index];
  const competencia = planned ? `${planned.ano}${planned.mes}` : buildCompetenciaFromSettings(settings);
  if (!competencia) {
    console.debug("[SIGESS] Não foi possível construir competência a partir de settings");
    return;
  }

  const queueStartMsg = esocialMessages.startingCompetencia(
    competenciaLabel(competencia),
    activeQueue.index + 1,
    activeQueue.competencias.length,
  );
  reportBatchStatus(queueStartMsg.status, queueStartMsg.title, queueStartMsg.description, {
    ...queueStatusExtra(activeQueue, competencia),
    overlayState: {
      step: activeQueue.index + 1,
      total: activeQueue.competencias.length,
      title: queueStartMsg.title,
      description: queueStartMsg.description,
    },
  });
  console.debug("[SIGESS] Iniciando fluxo direto a partir do contexto de pagamentos para competência:", competencia);

  if (!window.location.href.includes("/FolhaPagamento/Listagem/ListarPagamentos")) {
    const contextMsg = esocialMessages.openingGenerationContext(competencia);
    logger.info("eSocial", contextMsg.title);
    reportBatchStatus(contextMsg.status, contextMsg.title, contextMsg.description, {
      ...queueStatusExtra(activeQueue, competencia),
      overlayState: {
        step: activeQueue.index + 1,
        total: activeQueue.competencias.length,
        title: contextMsg.title,
        description: contextMsg.description,
      },
    });

    const listagemUrl = buildEsocialUrl(`/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`);
    setPendingGpsClosureState({
      competencia,
      valorComercializado: planned?.valorComercializado || settings.valorComercializado,
      competenciaIndex: activeQueue.index,
      step: "awaiting_generation_context_page",
    });
    console.debug("[SIGESS] Navegando uma única vez para o contexto de geração:", {
      listagemUrl,
      competencia,
    });
    window.location.href = listagemUrl;
    return;
  }

  // The current ListarPagamentos context is the synchronization boundary for
  // the whole tab. Read the complete Competencias table once, then keep the
  // resulting action plan in sessionStorage while the queue advances.
  activeQueue = await prepararPlanoDeGeracao(activeQueue, competencia);

  const checkMsg = esocialMessages.verifyingBoletoStatus();
  logger.info("eSocial", checkMsg.title);
  reportBatchStatus(checkMsg.status, checkMsg.title, checkMsg.description, {
    progressStep: 2,
    progressTotal: 3,
    ...queueStatusExtra(activeQueue, competencia),
    overlayState: {
      step: 2,
      total: 3,
      title: "Verificando boleto",
      description: `Consultando status do boleto de ${competenciaLabel(competencia)}...`,
    },
  });

  // The complete preflight decides whether the guide exists, whether the
  // sheet must be re-opened, or whether this competence can be generated.
  const guiaExistente = activeQueue.diagnostico?.[competencia]
    || await consultarGuiaExistenteViaApi(competencia);
  const acao = activeQueue.plano?.[competencia] || classificarCompetencia(guiaExistente);
  if (acao === "ja_existente" && hasGuiaEmitida(guiaExistente)) {
    // For an already registered DAE, use the same canonical route used by
    // the native "Emitir Guia" action. The URL extracted from the
    // Competencias HTML may refer to a javascript wrapper or an intermediate
    // page; fetching that URL can return the eSocial error page as HTML and
    // produce a misleading blob: tab instead of the PDF.
    const guiaUrl = buildEsocialUrl(
      `/FolhaPagamento/EmitirGuia/EmitirGuiaMensal?competencia=${competencia}`,
    );
    console.debug("[SIGESS] Emissão de boleto existente pela rota canônica:", {
      competencia,
      urlExtraida: guiaExistente.emissaoUrl,
      guiaUrl,
    });

    const issuedMsg = esocialMessages.guideAlreadyIssued(competencia);
    logger.info("eSocial", issuedMsg.title);
    reportBatchStatus(issuedMsg.status, issuedMsg.title, issuedMsg.description, {
      ...queueStatusExtra(activeQueue, competencia),
      overlayState: null,
    });
    await baixarGuiaPdfDirecto(
      guiaUrl,
      competencia,
      false,
      {
        valorComercializado: 0,
        valorDeclarado: guiaExistente.valorDeclarado,
        valorPago: guiaExistente.valorPago,
      },
    );
    await advanceGpsQueueAfterCompletion(
      settings,
      competencia,
      "ja_existente",
      {
        valorComercializado: 0,
        valorDeclarado: guiaExistente.valorDeclarado,
        valorPago: guiaExistente.valorPago,
      },
    );
    return;
  }

  // Uma URL de emissão sem valor declarado/pago não comprova a existência de
  // um DAE utilizável. Quando o contexto renderizado confirma que a folha está
  // encerrada, reabra-a pela rota nativa antes de enviar os dados novamente.
  if (acao === "reabrir_e_gerar" || isPayrollClosedInContext(document, competencia)) {
    iniciarReaberturaDaCompetencia(
      settings,
      competencia,
      planned?.valorComercializado || settings.valorComercializado,
      activeQueue,
    );
    return;
  }

  // Only generated competencies need the commercialisation value. Existing
  // guides and re-opened sheets have already been classified by the preflight,
  // avoiding one extra request per competency.
  const valorTotalComercializado = await extrairValorTotalComercializadoDaPagina(competencia);

  console.debug("[SIGESS] Valor comercializado para decisao inicial:", {
    valorTotalComercializado,
  });

  console.debug("[SIGESS] Competencia sem guia emitida; prosseguindo para geração direta:", {
    competencia,
    valorTotalComercializado,
    situacao: guiaExistente.situacao,
    valorDeclarado: guiaExistente.valorDeclarado,
    valorPago: guiaExistente.valorPago,
    emissaoUrl: guiaExistente.emissaoUrl,
  });

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
        description: `Preparando a guia de ${competenciaLabel(competencia)}...`,
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
    const queueAfterError = markCurrentCompetenciaResult("erro", errorMessage);
    clearGpsQueueState();
    reportBatchStatus(statusMsg.status, statusMsg.title, statusMsg.description, {
      lastError: errorMessage,
      ...(queueAfterError ? queueStatusExtra(queueAfterError, competencia) : {}),
      overlayState: null,
    });
  }
}
