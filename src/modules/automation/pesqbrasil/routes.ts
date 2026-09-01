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

export function isPesqBrasilWithoutReliabilitySealUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (!isPesqBrasilMpaUrl(parsed.href) || parsed.pathname !== "/login") return false;

    const error = parsed.searchParams.get("error");
    if (!error) return false;

    const details = JSON.parse(error) as { message?: unknown };
    return details.message === "USUARIO_SEM_SELO_CONFIABILIDADE";
  } catch {
    return false;
  }
}
