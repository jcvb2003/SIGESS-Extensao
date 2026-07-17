export function recoverCadUnicoIncompleteSuccessLogin(location: Location): boolean {
  if (
    location.hostname.includes("cadunico.dataprev.gov.br") &&
    location.hash === "#/successLogin"
  ) {
    location.replace("https://cadunico.dataprev.gov.br/#/home");
    return true;
  }
  return false;
}
