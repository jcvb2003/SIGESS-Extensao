import type { AppSettings } from "../../../shared/types";
import { Utils } from "../../../shared/utils/dom-helpers";

const CONSULTAR_REDIR_KEY = "sigess_last_redir_guias";
const LISTAR_PAGAMENTOS_URL = "https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/ListarPagamentos";
const COMPETENCIAS_URL = "https://www.esocial.gov.br/portal/FolhaPagamento/Listagem/Competencias";

export function isEsocialHomePage(url = window.location.href): boolean {
  return url.includes("Home/Inicial") || url.includes("tipoEmpregador=EMPREGADOR_DOMESTICO");
}

export function isListarPagamentosPage(url = window.location.href): boolean {
  return url.includes("FolhaPagamento/Listagem/ListarPagamentos");
}

async function waitForListarPagamentosReady(): Promise<void> {
  if (document.readyState === "loading") {
    await new Promise<void>((resolve) => document.addEventListener("DOMContentLoaded", () => resolve(), { once: true }));
  }
  await Utils.waitForElement("body", 15000, document, false);
  await new Promise((resolve) => window.setTimeout(resolve, 750));
}

/** Preserva a navegação nativa necessária para a consulta de competências. */
export async function directConsultationNavigation(settings: AppSettings): Promise<boolean> {
  if (!settings.consultarGuias) return false;
  const year = settings.selectedYear || "current";
  if (isEsocialHomePage()) {
    if (sessionStorage.getItem(CONSULTAR_REDIR_KEY) === `${year}:competencias`) return false;
    sessionStorage.setItem(CONSULTAR_REDIR_KEY, `${year}:listar`);
    window.location.href = LISTAR_PAGAMENTOS_URL;
    return true;
  }
  if (!isListarPagamentosPage() || sessionStorage.getItem(CONSULTAR_REDIR_KEY) !== `${year}:listar`) return false;
  await waitForListarPagamentosReady();
  sessionStorage.setItem(CONSULTAR_REDIR_KEY, `${year}:competencias`);
  window.location.href = COMPETENCIAS_URL;
  return true;
}
