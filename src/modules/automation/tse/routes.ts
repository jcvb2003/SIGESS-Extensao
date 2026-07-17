export const TSE_HOST = "www.tse.jus.br";
export const TSE_AUTOATENDIMENTO_PATH = "/servicos-eleitorais/autoatendimento-eleitoral";
export const TSE_QUERY_URL = `https://${TSE_HOST}${TSE_AUTOATENDIMENTO_PATH}#/atendimento-eleitor/consultar-numero-titulo-eleitor`;

export function isTseUrl(url: string): boolean {
  return url.includes("tse.jus.br");
}

export function isTseAutoatendimentoUrl(url: string): boolean {
  return isTseUrl(url) && url.includes(TSE_AUTOATENDIMENTO_PATH);
}
