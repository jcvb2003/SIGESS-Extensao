export const ESOCIAL_LOGIN_URL = "https://login.esocial.gov.br/";
export const ESOCIAL_HOST = "www.esocial.gov.br";
export const ESOCIAL_HOME_URL = "https://www.esocial.gov.br/portal/Home/Inicial?tipoEmpregador=EMPREGADOR_DOMESTICO";
export const ESOCIAL_CAEPF_COLLECTION_URL = "https://www.esocial.gov.br/portal/IntegracaoCaepf";
export const ESOCIAL_CADASTRO_DOMESTICO_URL = "https://www.esocial.gov.br/portal/Empregador/CadastroDomestico";

export function isEsocialUrl(url: string): boolean {
  return url.includes(ESOCIAL_HOST);
}

export function isEsocialHomeUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // O portal pode acrescentar parâmetros de sessão após o login. A rota Home
    // é a evidência estável de que o contexto autenticado foi carregado.
    return parsed.hostname === ESOCIAL_HOST && parsed.pathname.replace(/\/$/, "") === "/portal/Home/Inicial";
  } catch {
    return false;
  }
}

export function isEsocialCaepfCollectionUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === ESOCIAL_HOST && parsed.pathname === "/portal/IntegracaoCaepf";
  } catch {
    return false;
  }
}

export function isEsocialCadastroDomesticoUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === ESOCIAL_HOST
      && parsed.pathname.replace(/\/$/, "") === "/portal/Empregador/CadastroDomestico";
  } catch {
    return false;
  }
}
