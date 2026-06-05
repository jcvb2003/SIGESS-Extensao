import "../shared/utils/browser-shim";
import { initUI } from "../modules/reap-mpa/overlay";
import { initAgroUI } from "../modules/reap-agro/form-automation";

const injectReapPageDiagnostics = () => {
  if ((globalThis as any).__sigessReapPageDiagnosticsInjected) return;
  (globalThis as any).__sigessReapPageDiagnosticsInjected = true;
  try {
    const script = document.createElement("script");
    script.src = (globalThis.browser || globalThis.chrome).runtime.getURL("assets/reap_page_bridge.js");
    (document.head || document.documentElement).appendChild(script);
    console.log("SIGESS: Bridge script injected -> assets/reap_page_bridge.js");
  } catch (e) {
    console.error("SIGESS: Erro ao injetar bridge do REAP", e);
  }
};

const attachReapPageDiagnosticsLogger = () => {
  if ((globalThis as any).__sigessReapPageDiagnosticsLoggerAttached) return;
  (globalThis as any).__sigessReapPageDiagnosticsLoggerAttached = true;

  globalThis.addEventListener("message", (event) => {
    if (event.data?.type !== "SIGESS_REAP_PAGE_POST_CAPTURED") return;

    const payload = event.data.payload || {};
    console.log("%c=== [SIGESS PAGE DIAGNOSTICS] POST CAPTURED ===", "color: #00a86b; font-weight: bold; font-size: 14px;");
    console.log("Transport:", payload.transport);
    console.log("URL:", payload.url);
    console.log("Headers:", JSON.stringify(payload.headers ?? {}, null, 2));
    if (typeof payload.body === "string") {
      try {
        console.log("Body JSON:", JSON.stringify(JSON.parse(payload.body), null, 2));
      } catch {
        console.log("Body Raw:", payload.body);
      }
    } else {
      console.log("Body Raw:", payload.body);
    }
    console.log("%c=====================================================", "color: #00a86b; font-weight: bold;");
  });
};

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
  
  injectReapPageDiagnostics();
  attachReapPageDiagnosticsLogger();
  initUI();
  initAgroUI();
  console.log("SIGESS: REAP Observers Initialized");
};
init();
