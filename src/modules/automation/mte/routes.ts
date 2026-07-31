export const MTE_HOST = "servicos.mte.gov.br";
export const MTE_URL = `https://${MTE_HOST}/`;

export function isMteUrl(url: string): boolean {
  return url.includes(MTE_HOST);
}
