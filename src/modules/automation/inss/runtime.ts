import { INSS_AUTHENTICATED_SELECTOR, isInssDataUrl, isInssUrl } from "./routes";
import type { CadastroPortalRuntimeAdapter, CadastroPortalRuntimeContext } from "../cadastro/contracts";

export class InssPortalRuntime implements CadastroPortalRuntimeAdapter {
  readonly id = "inss" as const;
  private authenticatedReported = false;

  run({ sessionActive }: CadastroPortalRuntimeContext): void {
    const url = globalThis.location.href;
    if (!sessionActive || !isInssUrl(url) || isInssDataUrl(url) || this.authenticatedReported) return;

    const reportAuthenticated = () => {
      if (this.authenticatedReported || !document.querySelector(INSS_AUTHENTICATED_SELECTOR)) return false;
      this.authenticatedReported = true;
      void (globalThis.browser || globalThis.chrome).runtime.sendMessage({ action: "inssAuthenticated" });
      return true;
    };
    if (reportAuthenticated()) return;
    const observer = new MutationObserver(() => {
      if (reportAuthenticated()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }
}
