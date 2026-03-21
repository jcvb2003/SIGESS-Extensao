import { initUI } from "./ui";
import { initAgroUI } from "./agro";
if ((window as any).hasReapExtensionActive) {
  throw new Error("SIGESS: REAP already active");
}
(window as any).hasReapExtensionActive = true;
const checkLicenseBeforeInit = async () => {
  try {
    const response = await browser.runtime.sendMessage({
      action: "checkLicense",
    });
    if (!response?.ok) {
      console.warn("SIGESS: Licença inválida, REAP desabilitado.");
      return false;
    }
    return true;
  } catch {
    return false;
  }
};
const hostname = window.location.hostname;
checkLicenseBeforeInit().then((ok) => {
  if (!ok) return;
  if (hostname.includes("mpa.gov.br")) {
    initUI();
    console.log("SIGESS: MPA REAP Initialized");
  } else if (hostname.includes("agro.gov.br")) {
    initAgroUI();
    console.log("SIGESS: Agro REAP Initialized");
  }
});
