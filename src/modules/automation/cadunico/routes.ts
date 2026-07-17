export const CADUNICO_HOST = "cadunico.dataprev.gov.br";
export const CADUNICO_HOME_URL = `https://${CADUNICO_HOST}/#/home`;

export function isCadUnicoLocation(location: Pick<Location, "hostname">): boolean {
  return location.hostname.includes(CADUNICO_HOST);
}

export function isCadUnicoUrl(url: string): boolean {
  return url.includes(CADUNICO_HOST);
}

export function isCadUnicoIncompleteSuccessLogin(location: Location): boolean {
  return isCadUnicoLocation(location) && location.hash === "#/successLogin";
}
