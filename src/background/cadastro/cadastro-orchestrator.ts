import { resolveTseQueryProfile } from "../../modules/automation/cadastro/tse-query-profile";
import type { CadastroSession, PessoaData } from "../../shared/types";
import type { CadastroPortalId } from "../../modules/automation/cadastro/contracts";
import { StorageService } from "../services/storage";
import { isCadastroPortalTerminal } from "../../modules/automation/cadastro/session-status";
import { createCadastroPortalTab, getCadastroLaunchCredentials } from "./cadastro-portal-launcher";
import { saveCadastroSession } from "./cadastro-session-store";
import { getActiveCadastroSession } from "./cadastro-session-store";
import {
  applyCadastroPortalOutcome,
  getCadastroPortalForDataSource,
  isCadastroSessionReadyToFinalize,
  type CadastroReportedOutcome,
} from "./cadastro-session-controller";
import { INSS_LOGIN_URL } from "../../modules/automation/inss/routes";

export async function openCadastroInss(session: CadastroSession, getTabManager: () => any): Promise<void> {
  if (session.portais.inss) return;

  const creds = await getCadastroLaunchCredentials(session);
  if (!creds?.cpf || !creds.senha) {
    session.portais.inss = { status: "erro", evidence: "credenciais_indisponiveis", updatedAt: Date.now() };
    await saveCadastroSession(session);
    return;
  }

  session.portais.inss = { status: "abrindo", updatedAt: Date.now() };
  await saveCadastroSession(session);
  const tabId = await createCadastroPortalTab(
    session, getTabManager(), creds, "inss", INSS_LOGIN_URL,
  );
  if (tabId) session.portais.inss.tabId = tabId;
  else {
    session.portais.inss.status = "indisponivel";
    session.portais.inss.evidence = "falha_ao_abrir_aba";
  }
  session.portais.inss.updatedAt = Date.now();
  await saveCadastroSession(session);
}

export async function evaluateTseRequirement(
  session: CadastroSession,
  getTabManager?: () => any,
): Promise<void> {
  if (session.portais.tse) return;
  if (!["concluido", "nao_encontrado"].includes(session.portais.cadunico.status)) return;

  const settings = await StorageService.getSettings();
  if (settings.pessoaData?.fontes?.tse?.capturado) {
    session.portais.tse = { status: "dispensado", evidence: "dados_eleitorais_cadunico", updatedAt: Date.now() };
    await saveCadastroSession(session);
    return;
  }

  const pesqBrasilFinalizado = ["concluido", "erro", "indisponivel"].includes(session.portais.pesqbrasil.status);
  const inssPendente = session.portais.inss && !isCadastroPortalTerminal(session.portais.inss);
  if (!pesqBrasilFinalizado || inssPendente) return;

  const profile = resolveTseQueryProfile(settings);
  if (!profile.isSufficient || !getTabManager) {
    session.portais.tse = { status: "erro", evidence: "dados_insuficientes_para_consulta", updatedAt: Date.now() };
    await saveCadastroSession(session);
    return;
  }

  const creds = await getCadastroLaunchCredentials(session);
  if (!creds?.cpf || !creds.senha) return;

  session.portais.tse = { status: "abrindo", updatedAt: Date.now() };
  await saveCadastroSession(session);
  const tabId = await createCadastroPortalTab(
    session,
    getTabManager(),
    creds,
    "tse",
    "https://www.tse.jus.br/servicos-eleitorais/autoatendimento-eleitoral#/atendimento-eleitor/consultar-numero-titulo-eleitor",
  );
  if (tabId) session.portais.tse.tabId = tabId;
  else {
    session.portais.tse.status = "erro";
    session.portais.tse.evidence = "falha_ao_abrir_aba";
  }
  session.portais.tse.updatedAt = Date.now();
  await saveCadastroSession(session);
}

export async function finalizeCadastroSession(session: CadastroSession): Promise<void> {
  const settings = await StorageService.getSettings();
  const raw: Record<string, Partial<PessoaData>> = (settings.pessoaData_projections as any) || {};

  session.sessionState = "complete";
  session.mergeRequest = { raw };
  await saveCadastroSession(session);

  const tabIds = [
    session.portais.cadunico.tabId,
    session.portais.pesqbrasil.tabId,
    session.portais.ecac.tabId,
    session.portais.tse?.tabId,
    session.portais.inss?.tabId,
  ].filter((id): id is number => typeof id === "number");
  if (tabIds.length > 0) {
    try {
      await browser.tabs.remove(tabIds);
    } catch {
      // As abas podem já ter sido fechadas por uma coleta concorrente.
    }
  }
  setTimeout(async () => {
    try {
      await (browser as any).contextualIdentities.remove(session.cookieStoreId);
    } catch {
      // O container pode já ter sido removido.
    }
  }, 2000);
}

export async function processCadastroDataArrival(
  source: string,
  getTabManager?: () => any,
): Promise<void> {
  const session = await getActiveCadastroSession();
  if (!session) return;
  const portalId = getCadastroPortalForDataSource(session, source);
  const portal = portalId ? session.portais[portalId] : null;
  if (!portalId || !portal) return;

  if (source === "cadunico") {
    if (portal.status === "abrindo" || portal.status === "aguardando") portal.status = "coletando";
  } else {
    portal.status = "concluido";
  }
  await saveCadastroSession(session);
  await evaluateTseRequirement(session, getTabManager);

  const cadunicoDependenciesOpened =
    typeof session.portais.pesqbrasil.tabId === "number" &&
    typeof session.portais.ecac.tabId === "number";
  const canCloseCapturedTab = portalId !== "cadunico" ||
    (cadunicoDependenciesOpened && Boolean(session.portais.tse));
  if (portal.status === "concluido" && canCloseCapturedTab && typeof portal.tabId === "number") {
    try { await browser.tabs.remove(portal.tabId); } catch { /* Aba já fechada. */ }
  }
  if (isCadastroSessionReadyToFinalize(session)) await finalizeCadastroSession(session);
}

export async function processCadastroPortalOutcome(
  session: CadastroSession,
  portalId: CadastroPortalId,
  outcome: CadastroReportedOutcome,
  evidence: string,
  getTabManager: () => any,
): Promise<void> {
  applyCadastroPortalOutcome(session, portalId, outcome, evidence);
  await saveCadastroSession(session);
  if (portalId === "cadunico" && outcome === "not_found") {
    await openCadastroInss(session, getTabManager);
  }
  await evaluateTseRequirement(session, getTabManager);
  if (isCadastroSessionReadyToFinalize(session)) await finalizeCadastroSession(session);
}
