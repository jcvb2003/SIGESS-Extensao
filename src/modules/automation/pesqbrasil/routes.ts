export const PESQBRASIL_MPA_HOST = "pesqbrasil-pescadorprofissional.mpa.gov.br";
export const PESQBRASIL_AGRO_HOST = "pesqbrasil-pescadorprofissional.agro.gov.br";
export const PESQBRASIL_MPA_URL = `https://${PESQBRASIL_MPA_HOST}/`;
export const PESQBRASIL_AGRO_URL = `https://${PESQBRASIL_AGRO_HOST}/`;

export function isPesqBrasilUrl(url: string): boolean {
  return url.includes(PESQBRASIL_MPA_HOST) || url.includes(PESQBRASIL_AGRO_HOST);
}

export function isPesqBrasilMpaUrl(url: string): boolean {
  return url.includes(PESQBRASIL_MPA_HOST);
}
