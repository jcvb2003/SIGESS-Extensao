import { resolveTseQueryProfile } from "../../modules/automation/cadastro/tse-query-profile";
import type { CadastroSession } from "../../shared/types";
import { StorageService } from "../services/storage";
import { isCadastroPortalTerminal } from "../../modules/automation/cadastro/session-status";
import { createCadastroPortalTab, getCadastroLaunchCredentials } from "./cadastro-portal-launcher";
import { saveCadastroSession } from "./cadastro-session-store";

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
    session, getTabManager(), creds, "inss", "https://meu.inss.gov.br/#/login",
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
