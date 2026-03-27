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

const href = globalThis.location.href;
const isMpa = /mpa\.gov\.br\/manutencao\/[^/]+\/cadastro\//.test(href);
const isAgro = /agro\.gov\.br\/reap-simplificada\//.test(href);

if (isMpa || isAgro) {
  const init = async () => {
    const ok = await checkLicenseBeforeInit();
    if (!ok) return;
    if (isMpa) {
      initUI();
      console.log("SIGESS: MPA REAP Initialized");
    } else if (isAgro) {
      initAgroUI();
      console.log("SIGESS: Agro REAP Initialized");
    }
  };
  init();
}
