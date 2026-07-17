export const ECAC_HOST = "cav.receita.fazenda.gov.br";
export const CAEPF_HOST = "caepf.receita.fazenda.gov.br";
export const ECAC_LOGIN_URL = `https://${ECAC_HOST}/autenticacao/login`;
export const ECAC_COLLECTION_URL = "https://cav.receita.fazenda.gov.br/ecac/Aplicacao.aspx?id=89&origem=menu";

export function isEcacUrl(url: string): boolean {
  return url.includes(ECAC_HOST);
}

export function isEcacAuthUrl(url: string): boolean {
  return isEcacUrl(url) && url.includes("autenticacao");
}

export function isEcacCpfCollectionUrl(url: string): boolean {
  return isEcacUrl(url) && (url.includes("id=15") || url.includes("ConsultarCPF"));
}

export function isEcacCaepfCollectionUrl(url: string): boolean {
  return isEcacUrl(url) && url.includes("id=89");
}
