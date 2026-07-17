export const INSS_HOST = "meu.inss.gov.br";
export const INSS_LOGIN_URL = `https://${INSS_HOST}/#/login`;
export const INSS_DATA_URL = `https://${INSS_HOST}/#/dados-cadastrais?tk-categoria=Por%20Menu`;
export const INSS_AUTHENTICATED_SELECTOR = "#avatar-dropdown-trigger";

export function isInssUrl(url: string): boolean {
  return url.includes(INSS_HOST);
}

export function isInssDataUrl(url: string): boolean {
  return isInssUrl(url) && url.includes("dados-cadastrais");
}
