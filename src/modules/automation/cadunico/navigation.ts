import { CADUNICO_HOME_URL, isCadUnicoIncompleteSuccessLogin } from "./routes";

export function recoverCadUnicoIncompleteSuccessLogin(location: Location): boolean {
  if (isCadUnicoIncompleteSuccessLogin(location)) {
    location.replace(CADUNICO_HOME_URL);
    return true;
  }
  return false;
}
