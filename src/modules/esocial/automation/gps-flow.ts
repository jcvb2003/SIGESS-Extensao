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
import { reportBatchStatus } from "./overlay-ui";
import { baixarGuiaPdfDirecto } from "./guide-download";
import { esocialMessages } from "../utils/status-messages";

export async function executarFluxoDiretoGps(settings: AppSettings, competencia: string) {
  const valorComercializado = normalizeMoneyValue(settings.valorComercializado);
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

  await postJson(
    "/FolhaPagamento/SeguradoEspecial/SalvarRascunhoComercializacaoProducao",
    comercializacaoPayload,
  );

  const savingMsg = esocialMessages.savingCommercializationDraft();
  logger.info("eSocial", savingMsg.title);
  reportBatchStatus(savingMsg.status, savingMsg.title, savingMsg.description);

  await postJson(
    "/FolhaPagamento/SeguradoEspecial/EnviarEventosComercializacaoProducao",
    comercializacaoPayload,
  );

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
  const guiaUrl = resolveGuiaUrlFromDocument(fechamentoPostDoc, competencia);

  if (!guiaUrl) {
    throw new Error("Nao foi possivel localizar a URL de emissao da guia apos o fechamento.");
  }

  await baixarGuiaPdfDirecto(guiaUrl, competencia, true);

  sessionStorage.setItem(`${GPS_FLOW_DONE_PREFIX}${competencia}`, "true");
  await new Promise<void>((resolve) => setTimeout(resolve, 800));
  window.location.href = buildEsocialUrl(
    `/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`,
  );
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
  const params = new URLSearchParams();
  const elements = Array.from(
    doc.querySelectorAll("form input[name], form select[name], form textarea[name]"),
  ) as Array<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>;

  for (const element of elements) {
    const name = element.getAttribute("name");
    if (!name) continue;

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

  params.set("Competencia", competencia);
  params.set("PeriodoApuracao", `${competencia.slice(0, 4)}-${competencia.slice(4, 6)}`);
  params.set("commandName", "confirmar");

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
