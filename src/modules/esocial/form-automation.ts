import { Utils } from "../../shared/utils/dom-helpers";
import { AppSettings } from "../../shared/types";

const HOOKED_BUTTON_ATTR = "data-sigess-guide-hooked";
const GUIDE_OBSERVER_ATTR = "__sigessGuideObserverInitialized";
const GPS_FLOW_LOCK_KEY = "sigess_gps_flow_lock";
const GPS_FLOW_DONE_PREFIX = "sigess_gps_flow_done_";
const ESOCIAL_PROGRESS_OVERLAY_ID = "sigess-esocial-progress-overlay";
const ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY = "sigess_esocial_progress_overlay";
const ESOCIAL_PENDING_DOWNLOAD_HINT_KEY = "sigess_esocial_pending_download_hint";

const browserAPI =
  typeof browser !== "undefined" ? browser : (window as any).chrome;

const ESOCIAL_PORTAL_BASE = "https://www.esocial.gov.br/portal";

type ComercializacaoTipoPayload = {
  CodigoTipo: string;
  RequerAdquirente: string;
  ValorComercializado: string;
  Excluido: string;
  Adquirentes: Array<Record<string, string>>;
};

type ComercializacaoPayload = Array<{
  IdComercializacao: string;
  TipoInscricaoEstabelecimento: string;
  InscricaoEstabelecimento: string;
  DescricaoEstabelecimento: string;
  Excluido: string;
  Competencia: string;
  TiposComercializacao: ComercializacaoTipoPayload[];
}>;

type EsocialOverlayState = {
  step: number;
  total: number;
  title: string;
  description: string;
  complete?: boolean;
  hideAt?: number;
};

function reportBatchStatus(
  status: string,
  statusTitle: string,
  statusDescription: string,
  extra?: Record<string, unknown>,
) {
  const overlayState = (extra?.overlayState as EsocialOverlayState | null | undefined) ?? undefined;
  const payloadExtra = { ...(extra || {}) };
  delete payloadExtra.overlayState;

  try {
    browserAPI.runtime?.sendMessage?.({
      action: "updateGovBatchStatus",
      status,
      statusTitle,
      statusDescription,
      ...payloadExtra,
    });
  } catch (error) {
    console.debug("[SIGESS] Falha ao reportar status do lote:", error);
  }

  if (overlayState === null) {
    clearEsocialProgressOverlay();
  } else if (overlayState) {
    renderEsocialProgressOverlay(overlayState);
  }
}

function renderEsocialProgressOverlay(state: EsocialOverlayState) {
  persistEsocialProgressOverlay(state);

  let overlay = document.getElementById(ESOCIAL_PROGRESS_OVERLAY_ID);
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = ESOCIAL_PROGRESS_OVERLAY_ID;
    overlay.style.cssText =
      "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); z-index: 99999; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(2px);";
    document.body.appendChild(overlay);
  }

  const overlayTotal = 2;
  const overlayStep = state.complete ? 2 : 1;

  const segments = Array.from({ length: overlayTotal })
    .map((_, index) => {
      const filled = index < overlayStep;
      return `<span style="height: 8px; flex: 1; border-radius: 999px; background: ${
        filled ? "#007bff" : "#d9e2ec"
      }; transition: background 0.2s ease;"></span>`;
    })
    .join("");

  overlay.innerHTML = `<div style="background: white; padding: 24px 28px; border-radius: 14px; width: min(420px, calc(100vw - 32px)); font-family: sans-serif; box-shadow: 0 4px 15px rgba(0,0,0,0.3); color: #0f172a; display: flex; flex-direction: column; align-items: stretch; gap: 14px;">
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width: 30px; height: 30px; border: 4px solid #f3f3f3; border-top: 4px solid ${
          state.complete ? "#16a34a" : "#007bff"
        }; border-radius: 50%; animation: ${
          state.complete ? "none" : "sigessEsocialSpin 1s linear infinite"
        };"></div>
        <div style="display:flex; flex-direction:column; gap:4px;">
          <strong style="font-size: 16px; color: #0f172a;">${escapeHtml(state.title)}</strong>
          <span style="font-size: 12px; color: #475569;">${escapeHtml(state.description)}</span>
        </div>
      </div>
      <div style="display:flex; justify-content:space-between; align-items:center; font-size:12px; color:#475569;">
        <span>Progresso do script</span>
        <span>${overlayStep}/${overlayTotal}</span>
      </div>
      <div style="display:flex; gap:6px;">${segments}</div>
    </div>
    <style>@keyframes sigessEsocialSpin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }</style>`;
  overlay.style.display = "flex";

  if (state.hideAt && state.hideAt > Date.now()) {
    window.setTimeout(() => {
      const stored = readEsocialProgressOverlay();
      if (stored?.hideAt === state.hideAt) {
        clearEsocialProgressOverlay();
      }
    }, state.hideAt - Date.now());
  }
}

function clearEsocialProgressOverlay() {
  sessionStorage.removeItem(ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY);
  const overlay = document.getElementById(ESOCIAL_PROGRESS_OVERLAY_ID);
  if (overlay) {
    overlay.remove();
  }
}

function persistEsocialProgressOverlay(state: EsocialOverlayState) {
  sessionStorage.setItem(ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY, JSON.stringify(state));
}

function readEsocialProgressOverlay(): EsocialOverlayState | null {
  try {
    const raw = sessionStorage.getItem(ESOCIAL_PROGRESS_OVERLAY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as EsocialOverlayState) : null;
  } catch {
    return null;
  }
}

function hydrateEsocialProgressOverlay() {
  const state = readEsocialProgressOverlay();
  if (!state) return;

  if (state.hideAt && state.hideAt <= Date.now()) {
    clearEsocialProgressOverlay();
    return;
  }

  renderEsocialProgressOverlay(state);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildPortalUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ESOCIAL_PORTAL_BASE}${normalizedPath}`;
}

function isHomePage(): boolean {
  return (
    window.location.href.includes("Home/Inicial") ||
    window.location.href.includes("tipoEmpregador=EMPREGADOR_DOMESTICO")
  );
}

function buildCompetenciaFromSettings(settings: AppSettings): string | null {
  const anoAtual = new Date().getFullYear();
  const mes = (settings.selectedMonth || "").padStart(2, "0");
  if (!/^\d{2}$/.test(mes)) return null;
  return `${anoAtual}${mes}`;
}

function formatCompetencia(competencia: string | null): string {
  if (!competencia || !/^\d{6}$/.test(competencia)) return "SEM_PERIODO";
  return `${competencia.slice(0, 4)}-${competencia.slice(4, 6)}`;
}

function normalizeMoneyValue(value: string): string {
  const trimmed = String(value || "").trim();
  return trimmed || "0";
}

function processarConfiguracoes(settings: AppSettings, force = false) {
  const canRedirect = (key: string, value: string) => {
    if (force) return true;
    return sessionStorage.getItem(key) !== value;
  };

  if (!isHomePage()) return;

  if (settings.consultarGuias) {
    const yearStr = settings.selectedYear || "current";
    if (canRedirect("sigess_last_redir_guias", yearStr)) {
      reportBatchStatus(
        "processando",
        "Redirecionando para competencias",
        "O eSocial foi carregado e a extensao esta abrindo a listagem de competencias para consultar as guias.",
      );
      sessionStorage.setItem("sigess_last_redir_guias", yearStr);
      window.location.href =
        "https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/Competencias";
    }
  }
}

async function automatizarCompetencias(settings: AppSettings) {
  if (!window.location.href.includes("FolhaPagamento/Listagem/Competencias")) {
    return;
  }

  reportBatchStatus(
    "processando",
    "Pagina de competencias carregada",
    "A listagem de competencias do eSocial foi aberta e a extensao esta verificando o filtro de ano.",
  );

  if (!settings.consultarGuias || settings.selectedYear === "current") {
    return;
  }

  const select = (await Utils.waitForElement(
    "#AnoFiltrado",
    15000,
    document,
    false,
  )) as HTMLSelectElement;

  if (select && select.value !== settings.selectedYear) {
    reportBatchStatus(
      "processando",
      "Aplicando filtro de ano",
      `A extensao esta ajustando o ano da competencia para ${settings.selectedYear}.`,
    );
    select.value = settings.selectedYear;
    select.dispatchEvent(new Event("change", { bubbles: true }));
    const btn = await Utils.waitForElement("#btnFiltro", 5000, document, false);
    if (btn) {
      Utils.simulateClick(btn as HTMLElement);
    }
  }
}

async function automatizarGPS(settings: AppSettings) {
  if (!settings.gerarGps) {
    clearEsocialProgressOverlay();
    return;
  }

  const competencia =
    extractCompetenciaFromUrl(window.location.href) ||
    extractCompetenciaFromDom() ||
    buildCompetenciaFromSettings(settings);

  if (!competencia) {
    return;
  }

  const guiaExistente = await jaExisteGuiaComValor(competencia);
  if (guiaExistente) {
    sessionStorage.setItem(`${GPS_FLOW_DONE_PREFIX}${competencia}`, "true");
    reportBatchStatus(
      "ignorado",
      "Guia ja existente",
      `A competencia ${formatCompetencia(competencia)} ja possui guia/boleto com valor maior que zero. A extensao nao vai gerar novamente.`,
      { overlayState: null },
    );
    return;
  }

  if (!acquireGpsFlowLock(competencia)) {
    return;
  }

  try {
    reportBatchStatus(
      "processando",
      "Iniciando geracao da guia",
      `A extensao esta executando o fluxo direto da competencia ${formatCompetencia(competencia)} sem depender da navegacao manual do portal.`,
      {
        progressStep: 2,
        progressTotal: 3,
        overlayState: {
          step: 2,
          total: 3,
          title: "Executando script no eSocial",
          description: `Gerando a guia da competencia ${formatCompetencia(competencia)}.`,
        },
      },
    );

    await executarFluxoDiretoGps(settings, competencia);
    sessionStorage.setItem(`${GPS_FLOW_DONE_PREFIX}${competencia}`, "true");
  } catch (error) {
    console.error("[SIGESS] Falha no fluxo direto da guia:", error);
    reportBatchStatus(
      "erro",
      "Falha no fluxo direto da guia",
      "A extensao nao conseguiu concluir a geracao automatica da guia pelo fluxo direto.",
      {
        lastError: error instanceof Error ? error.message : String(error),
        overlayState: null,
      },
    );
  } finally {
    releaseGpsFlowLock();
  }
}

function acquireGpsFlowLock(competencia: string): boolean {
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

function releaseGpsFlowLock() {
  sessionStorage.removeItem(GPS_FLOW_LOCK_KEY);
}

async function jaExisteGuiaComValor(competencia: string): Promise<boolean> {
  try {
    const targetUrl = buildPortalUrl(
      `/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`,
    );

    const doc =
      window.location.href.includes("/FolhaPagamento/Listagem/ListarPagamentos") &&
      extractCompetenciaFromUrl(window.location.href) === competencia
        ? document
        : parseHtml(
            await fetch(targetUrl, {
              method: "GET",
              credentials: "include",
            }).then((response) => response.text()),
          );

    return documentHasPositiveGuideValue(doc);
  } catch (error) {
    console.debug("[SIGESS] Falha ao verificar guia existente:", error);
    return false;
  }
}

function documentHasPositiveGuideValue(doc: Document): boolean {
  const rowCandidates = Array.from(
    doc.querySelectorAll("tr, .row, .card, .panel, .list-group-item"),
  );

  for (const candidate of rowCandidates) {
    const text = (candidate.textContent || "").replace(/\s+/g, " ").trim();
    if (!text) continue;

    const normalized = text.toLowerCase();
    if (
      !normalized.includes("guia") &&
      !normalized.includes("boleto") &&
      !normalized.includes("gps") &&
      !normalized.includes("darf") &&
      !normalized.includes("dae")
    ) {
      continue;
    }

    const values = extractMoneyValues(text);
    if (values.some((value) => value > 0)) {
      return true;
    }
  }

  return false;
}

function extractMoneyValues(text: string): number[] {
  const matches = text.match(/\d{1,3}(?:\.\d{3})*,\d{2}/g) || [];
  return matches
    .map((value) => Number(value.replace(/\./g, "").replace(",", ".")))
    .filter((value) => Number.isFinite(value));
}

async function executarFluxoDiretoGps(settings: AppSettings, competencia: string) {
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
    "Salvando rascunho da comercializacao",
    "A extensao esta enviando o JSON de rascunho da comercializacao diretamente ao eSocial.",
  );

  await postJson(
    "/FolhaPagamento/SeguradoEspecial/EnviarEventosComercializacaoProducao",
    comercializacaoPayload,
    "Enviando eventos da comercializacao",
    "O rascunho foi salvo e a extensao esta transmitindo os eventos para liberar o fechamento.",
  );

  const verificacaoTexto = await verificarAcessoFechamento(competencia);
  if (verificacaoTexto) {
    const verificacao = safeParseJson<{ Sucesso?: boolean }>(verificacaoTexto);
    if (verificacao && verificacao.Sucesso === false) {
      throw new Error("O eSocial nao liberou o fechamento da folha.");
    }
  }

  reportBatchStatus(
    "processando",
    "Carregando tela de fechamento",
    `A comercializacao da competencia ${formatCompetencia(competencia)} foi enviada e a extensao esta abrindo o fechamento da folha por requisicao direta.`,
  );

  const fechamentoGetResponse = await fetch(
    buildPortalUrl(`/FolhaPagamento/FechamentoFolha?competencia=${competencia}`),
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

  reportBatchStatus(
    "processando",
    "Fechando a folha",
    `A extensao esta enviando o POST de fechamento da competencia ${formatCompetencia(competencia)}.`,
  );

  const fechamentoPostResponse = await fetch(
    buildPortalUrl(`/FolhaPagamento/FechamentoFolha?competencia=${competencia}`),
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

  await baixarGuiaPdf(guiaUrl, competencia);

  window.location.href = buildPortalUrl(
    `/FolhaPagamento/Listagem/ListarPagamentos?competencia=${competencia}`,
  );
}

async function carregarDadosComercializacao(competencia: string) {
  reportBatchStatus(
    "processando",
    "Carregando dados de comercializacao",
    `A extensao esta consultando os dados da competencia ${formatCompetencia(competencia)} antes do envio.`,
  );

  const comercializacaoPromise = fetch(
    buildPortalUrl(
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
    buildPortalUrl(
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

async function postJson(
  path: string,
  payload: unknown,
  statusTitle: string,
  statusDescription: string,
) {
  reportBatchStatus("processando", statusTitle, statusDescription);

  const response = await fetch(buildPortalUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Falha ao chamar ${path}: HTTP ${response.status}`);
  }

  return response.text();
}

async function verificarAcessoFechamento(competencia: string) {
  reportBatchStatus(
    "processando",
    "Verificando acesso ao fechamento",
    `A extensao esta confirmando se a competencia ${formatCompetencia(competencia)} ja pode seguir para o fechamento da folha.`,
  );

  try {
    const response = await fetch(
      buildPortalUrl(
        `/FolhaPagamento/SeguradoEspecial/VerificarAcessoFechamentoFolhaAposEnvioEventosComercializacao?competencia=${competencia}`,
      ),
      {
        method: "GET",
        credentials: "include",
      },
    );

    return await response.text();
  } catch (error) {
    console.debug("[SIGESS] Falha ao verificar acesso ao fechamento:", error);
    return null;
  }
}

function parseHtml(html: string): Document {
  return new DOMParser().parseFromString(html, "text/html");
}

function buildComercializacaoPayload(
  doc: Document,
  competencia: string,
  valorComercializado: string,
): ComercializacaoPayload {
  const grouped = new Map<string, Record<string, string>>();
  const hiddenInputs = Array.from(
    doc.querySelectorAll('input[type="hidden"][name]'),
  ) as HTMLInputElement[];

  for (const input of hiddenInputs) {
    const match = /^\[(\d+)\]\.(.+)$/.exec(input.name);
    if (!match) continue;

    const [, index, fieldName] = match;
    const current = grouped.get(index) || {};
    current[fieldName] = input.value;
    grouped.set(index, current);
  }

  return Array.from(grouped.entries())
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([, fields]) => ({
      IdComercializacao: fields.IdComercializacao || "0",
      TipoInscricaoEstabelecimento: fields.TipoInscricaoEstabelecimento || "",
      InscricaoEstabelecimento: fields.InscricaoEstabelecimento || "",
      DescricaoEstabelecimento: fields.DescricaoEstabelecimento || "",
      Excluido: fields.Excluido || "False",
      Competencia: fields.Competencia || competencia,
      TiposComercializacao: extractTiposComercializacao(fields, valorComercializado),
    }));
}

function extractTiposComercializacao(
  fields: Record<string, string>,
  valorComercializado: string,
): ComercializacaoTipoPayload[] {
  const tipos = new Map<string, Partial<ComercializacaoTipoPayload>>();

  for (const [fieldName, value] of Object.entries(fields)) {
    const match = /^TiposComercializacao\[(\d+)\]\.(.+)$/.exec(fieldName);
    if (!match) continue;

    const [, index, tipoField] = match;
    const current = tipos.get(index) || {};
    (current as Record<string, string>)[tipoField] = value;
    tipos.set(index, current);
  }

  return Array.from(tipos.entries())
    .sort(([left], [right]) => Number(left) - Number(right))
    .map(([index, tipo]) => ({
      CodigoTipo: tipo.CodigoTipo || "",
      RequerAdquirente: tipo.RequerAdquirente || "False",
      ValorComercializado:
        index === "0" ? valorComercializado : tipo.ValorComercializado || "0",
      Excluido: tipo.Excluido || "False",
      Adquirentes: [],
    }));
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

function resolveGuiaUrlFromDocument(doc: Document, competencia: string): string | null {
  const anchor =
    (doc.querySelector("#btn-emitir-guia") as HTMLAnchorElement | null) ||
    (Array.from(doc.querySelectorAll("a")).find((item) =>
      isEmitirGuiaAnchor(item as HTMLAnchorElement),
    ) as HTMLAnchorElement | undefined) ||
    null;

  const resolvedFromAnchor = anchor ? resolveGuiaDownloadUrl(anchor) : null;
  if (resolvedFromAnchor) {
    return resolvedFromAnchor;
  }

  const html = doc.documentElement?.outerHTML || "";
  const guiaPathMatch = /FolhaPagamento\/EmitirGuia\/EmitirGuiaMensal\?competencia=\d{6}/.exec(html);
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

  const response = await fetch(guiaUrl, {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Falha ao baixar guia: HTTP ${response.status}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  const blob = await response.blob();
  const buffer = await blob.arrayBuffer();
  const isPdf =
    contentType.includes("application/pdf") || looksLikePdfBuffer(buffer);

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
      const nome = normalizeFilePart(nomeBruto);
      const filename = `${nome}_${cpf}_${periodo}.pdf`;

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

  const dataUrl = await blobToDataUrl(blob);
  const cpf = await getBestCpf();
  const nomeBruto = await getBestNome();
  const nome = normalizeFilePart(nomeBruto);
  const periodo = formatCompetencia(competencia);
  const filename = `${nome}_${cpf}_${periodo}.pdf`;

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

  await triggerLocalDownload(dataUrl, filename);
}

function safeParseJson<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function looksLikePdfBuffer(buffer: ArrayBuffer): boolean {
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

async function safeDecodeBufferAsText(buffer: ArrayBuffer): Promise<string | null> {
  try {
    return new TextDecoder("utf-8").decode(buffer);
  } catch {
    return null;
  }
}

function resolvePdfUrlFromHtml(html: string, baseUrl: string): string | null {
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
          return new URL(rawUrl, baseUrl).toString();
        }
      }
    }

    const directPdfMatch =
      /https?:\/\/[^\s"'<>]+\.pdf\b/i.exec(html) ||
      /\/[^\s"'<>]+\.pdf\b/i.exec(html);

    if (directPdfMatch?.[0]) {
      return new URL(directPdfMatch[0], baseUrl).toString();
    }

    return null;
  } catch {
    return null;
  }
}

function looksLikeHtmlDocument(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized.startsWith("<!doctype html") ||
    normalized.startsWith("<html") ||
    normalized.includes("<body") ||
    normalized.includes("<iframe") ||
    normalized.includes("<embed")
  );
}

function observarBotaoEmitirGuia() {
  const sigessWindow = window as unknown as Record<string, unknown>;

  if (sigessWindow[GUIDE_OBSERVER_ATTR]) {
    return;
  }

  if (!window.location.href.includes("/FolhaPagamento/FechamentoFolha")) {
    return;
  }

  if (sessionStorage.getItem(GPS_FLOW_LOCK_KEY)) {
    return;
  }

  const observerTarget = document.body || document.documentElement;
  if (!observerTarget) {
    return;
  }

  sigessWindow[GUIDE_OBSERVER_ATTR] = true;

  const observer = new MutationObserver(() => {
    const botoesEmitirGuia = Array.from(
      document.querySelectorAll("a"),
    ) as HTMLAnchorElement[];
    const candidatos = botoesEmitirGuia.filter((anchor) => isEmitirGuiaAnchor(anchor));
    if (candidatos.length === 0) return;

    for (const botaoEmitirGuia of candidatos) {
      if (botaoEmitirGuia.getAttribute(HOOKED_BUTTON_ATTR) === "true") continue;

      botaoEmitirGuia.setAttribute(HOOKED_BUTTON_ATTR, "true");
      reportBatchStatus(
        "processando",
        "Botao de emissao localizado",
        "A extensao encontrou o botao Emitir Guia e esta pronta para capturar o PDF gerado pelo eSocial.",
      );
      console.log("[SIGESS] Botao encontrado e listener registrado");

      botaoEmitirGuia.addEventListener(
        "click",
        async (event) => {
          console.log("[SIGESS] Clique detectado no botao");
          event.preventDefault();
          event.stopPropagation();

          const targetUrl = resolveGuiaDownloadUrl(botaoEmitirGuia);
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
          }
        },
        { capture: true },
      );
    }
  });

  observer.observe(observerTarget, {
    childList: true,
    subtree: true,
    attributes: false,
  });
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

function resolveGuiaDownloadUrl(botaoEmitirGuia: HTMLAnchorElement): string | null {
  const href = botaoEmitirGuia.getAttribute("href") || "";
  if (href && !href.startsWith("javascript:")) {
    return new URL(href, window.location.origin).toString();
  }

  const hrefRedirectMatch = /redirecionar\('([^']+)'/.exec(href);
  if (hrefRedirectMatch?.[1]) {
    return new URL(hrefRedirectMatch[1], `${window.location.origin}/portal/`).toString();
  }

  const onclick = botaoEmitirGuia.getAttribute("onclick") || "";
  const match = /MontaCaminhoCompleto\('([^']+)'\)/.exec(onclick);
  if (match?.[1]) {
    return new URL(match[1], `${window.location.origin}/portal/`).toString();
  }

  const redirectMatch = /redirecionar\('([^']+)'/.exec(onclick);
  if (redirectMatch?.[1]) {
    return new URL(redirectMatch[1], `${window.location.origin}/portal/`).toString();
  }

  return null;
}

function extractCompetenciaFromUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url, window.location.origin);
    const competencia = parsed.searchParams.get("competencia");
    return competencia && /^\d{6}$/.test(competencia) ? competencia : null;
  } catch {
    const match = /competencia=(\d{6})/.exec(url);
    return match?.[1] || null;
  }
}

function extractCompetenciaFromDom(): string | null {
  const candidates = [
    (document.querySelector("#Competencia") as HTMLInputElement | null)?.value,
    (document.querySelector("#hiddenCompetencia") as HTMLInputElement | null)?.value,
    (document.querySelector("#PeriodoApuracao") as HTMLInputElement | null)?.value?.replace(
      "-",
      "",
    ),
  ];

  for (const candidate of candidates) {
    if (candidate && /^\d{6}$/.test(candidate)) return candidate;
  }

  return null;
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function getStoredCpf(): Promise<string> {
  const creds = await browserAPI.storage.local.get(null);
  const credKey = Object.keys(creds).find((key) => key.startsWith("credenciais_"));
  const cpf = credKey
    ? creds[credKey]?.cpf
    : creds.sigess_last_esocial_credentials?.cpf;
  return String(cpf || "SEM_CPF").replace(/\D/g, "");
}

async function getStoredNome(): Promise<string> {
  const creds = await browserAPI.storage.local.get(null);
  const credKey = Object.keys(creds).find((key) => key.startsWith("credenciais_"));
  return String(
    (credKey ? creds[credKey]?.nome : creds.sigess_last_esocial_credentials?.nome) ||
      "SEM_NOME",
  );
}

async function getBestCpf(): Promise<string> {
  const fromStorage = await getStoredCpf();
  if (fromStorage && fromStorage !== "SEMCPF" && fromStorage !== "SEM_CPF") {
    return fromStorage;
  }

  const globalCpf = String((window as { identidadeLocal?: unknown }).identidadeLocal || "")
    .replace(/\D/g, "");
  if (globalCpf) return globalCpf;

  return "SEM_CPF";
}

async function getBestNome(): Promise<string> {
  const globalNome = extractCleanName(
    String((window as { nomeUsuario?: unknown }).nomeUsuario || "").trim(),
  );
  if (globalNome) return globalNome;

  const fromStorage = await getStoredNome();
  const fromStorageClean = extractCleanName(fromStorage);
  if (fromStorageClean) return fromStorageClean;

  const domNome =
    extractCleanName(document.querySelector(".nome-usuario")?.textContent?.trim() || "") ||
    document.querySelector("#header")?.textContent?.trim() ||
    "";

  return extractCleanName(domNome) || "SEM_NOME";
}

function normalizeFilePart(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, " ")
      .replace(/\s+/g, " ")
      .trim() || "SEM_NOME"
  );
}

function extractCleanName(value: string): string {
  if (!value) return "";

  const explicitMatch = /-\s*([A-ZÀ-Ý\s]+?)(?:Trocar Perfil|SAIR|Login|$)/i.exec(value);
  if (explicitMatch?.[1]) {
    return explicitMatch[1].replace(/\s+/g, " ").trim();
  }

  const upperBlocks = value.match(/[A-ZÀ-Ý]{2,}(?:\s+[A-ZÀ-Ý]{2,})+/g);
  if (upperBlocks?.length) {
    return upperBlocks[upperBlocks.length - 1].replace(/\s+/g, " ").trim();
  }

  return value.replace(/\s+/g, " ").trim();
}

async function triggerLocalDownload(dataUrl: string, filename: string) {
  try {
    const response = await browserAPI.runtime?.sendMessage?.({
      action: "downloadESocialGuide",
      dataUrl,
      filename,
    });

    if (response?.success) {
      return;
    }
  } catch (error) {
    console.debug("[SIGESS] Falha no download via background, usando fallback local:", error);
  }

  const anchor = document.createElement("a");
  anchor.href = dataUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  queueMicrotask(() => {
    anchor.remove();
  });
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

function start(settings: AppSettings, force = false) {
  if (settings.gerarGps) {
    hydrateEsocialProgressOverlay();
  } else {
    clearEsocialProgressOverlay();
  }
  processarConfiguracoes(settings, force);
  observarBotaoEmitirGuia();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      automatizarCompetencias(settings);
      automatizarGPS(settings);
    });
  } else {
    automatizarCompetencias(settings);
    automatizarGPS(settings);
  }
}

browserAPI.storage.local.get(["sigessSettings"], (result: any) => {
  const settings = result.sigessSettings as AppSettings;
  if (settings) {
    start(settings, false);
  }
});

browserAPI.runtime.onMessage.addListener((message: any) => {
  if (message.action === "updateESocialSettings") {
    const settings = message.settings as AppSettings;
    start(settings, true);
  }
});
