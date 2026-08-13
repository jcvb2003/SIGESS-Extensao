import { logger } from "../../../shared/services/logger";
import { AppSettings } from "../../../shared/types";
import {
  extractMoneyValues,
  extractCompetenciaFromUrl,
  extractCompetenciaFromDom,
} from "../utils/esocial-extractors";
import {
  GPS_FLOW_LOCK_KEY,
  GPS_FLOW_DONE_PREFIX,
  GPS_FLOW_PENDING_STATE_KEY,
} from "../utils/esocial-constants";
import { parseHtml, resolveGuiaUrlFromDocument } from "../services/document-parser";
import { resolveGuiaDownloadUrlFromAnchor } from "../services/guide-url-resolver";
import { postJson, getText, buildEsocialUrl } from "../services/esocial-api";
import { buildComercializacaoPayload } from "../services/comercializacao";
import { reportBatchStatus, showSuccessModal } from "./overlay-ui";
import { baixarGuiaPdfDirecto } from "./guide-download";
import { esocialMessages } from "../utils/status-messages";
import { fetchBoletoData, fetchComercializacaoData } from "../services/esocial-data-fetcher";

type PendingGpsClosureState = {
  competencia: string;
  valorComercializado?: string;
  enviaRemuneracoesBody?: string;
  listagemNavigationStartedAt?: number;
  fechamentoNavigationStartedAt?: number;
  fechamentoSubmittedAt?: number;
  step: "awaiting_remuneracoes_page" | "awaiting_closure_page" | "awaiting_closure_result";
};

export async function executarFluxoDiretoGps(settings: AppSettings, competencia: string) {
  const valorComercializado = normalizeMoneyValue(settings.valorComercializado);
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
  if (window.location.href.includes("/FolhaPagamento/Listagem/ListarPagamentos")) {
    submitNativeEnviaRemuneracoes(enviaRemuneracoesParams, competencia, valorComercializado);
    return;
  }

  const listagemUrl = buildEsocialUrl(`/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`);
  setPendingGpsClosureState({
    competencia,
    valorComercializado,
    enviaRemuneracoesBody: enviaRemuneracoesParams.toString(),
    listagemNavigationStartedAt: Date.now(),
    step: "awaiting_remuneracoes_page",
  });
  console.debug("[SIGESS] Navegando para ListarPagamentos antes do EnviaRemuneracoes:", {
    listagemUrl,
    competencia,
  });
  window.location.href = listagemUrl;
  return;
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

export async function resumePendingGpsFlow(): Promise<boolean> {
  const pending = getPendingGpsClosureState();
  if (!pending) {
    return false;
  }

  const currentCompetencia =
    extractCompetenciaFromUrl(window.location.href) || extractCompetenciaFromDom();
  if (!currentCompetencia || currentCompetencia !== pending.competencia) {
    return false;
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
    clearPendingGpsClosureState();
    releaseGpsFlowLock();

    const statusMsg = esocialMessages.failedToGenerateGuide();
    logger.error("eSocial", statusMsg.title, { error: fechamentoHtmlError });
    reportBatchStatus(statusMsg.status, statusMsg.title, statusMsg.description, {
      lastError: fechamentoHtmlError,
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
  sessionStorage.setItem(`${GPS_FLOW_DONE_PREFIX}${pending.competencia}`, "true");
  releaseGpsFlowLock();
  showSuccessModal("Boleto Gerado!");
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
  const mes = (settings.selectedMonth || "").padStart(2, "0");
  if (!/^\d{2}$/.test(mes)) return null;
  return `${anoAtual}${mes}`;
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
    !!info.emissaoUrl ||
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
  const competencia = buildCompetenciaFromSettings(settings);
  if (!competencia) {
    console.debug("[SIGESS] Não foi possível construir competência a partir de settings");
    return;
  }

  console.debug("[SIGESS] Iniciando fluxo direto da home page para competência:", competencia);

  const checkMsg = esocialMessages.verifyingBoletoStatus();
  logger.info("eSocial", checkMsg.title);
  reportBatchStatus(checkMsg.status, checkMsg.title, checkMsg.description, {
    progressStep: 2,
    progressTotal: 3,
    overlayState: {
      step: 2,
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
    if (hasGuiaEmitida(guiaExistente)) {
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
        {
          valorComercializado: valorTotalComercializado,
          valorDeclarado: guiaExistente.valorDeclarado,
          valorPago: guiaExistente.valorPago,
        },
      );
      sessionStorage.setItem(`${GPS_FLOW_DONE_PREFIX}${competencia}`, "true");
      showSuccessModal("Boleto Gerado!");
      return;
    }

    console.debug("[SIGESS] Competencia com comercializacao salva, mas sem guia emitida ainda:", {
      competencia,
      valorTotalComercializado,
      situacao: guiaExistente.situacao,
      valorDeclarado: guiaExistente.valorDeclarado,
      valorPago: guiaExistente.valorPago,
      emissaoUrl: guiaExistente.emissaoUrl,
    });
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
      description: `Preparando a guia de ${competencia}...`,
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
