import "../shared/utils/browser-shim";
import { initUI } from "../modules/reap-mpa/overlay";
import { initAgroUI } from "../modules/reap-agro/form-automation";

if ((globalThis as any).hasReapExtensionActive) {
  throw new Error("SIGESS: REAP already active");
}
(globalThis as any).hasReapExtensionActive = true;

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

const init = async () => {
  const ok = await checkLicenseBeforeInit();
  if (!ok) return;
  
  initUI();
  initAgroUI();
  console.log("SIGESS: REAP Observers Initialized");
};
init();
