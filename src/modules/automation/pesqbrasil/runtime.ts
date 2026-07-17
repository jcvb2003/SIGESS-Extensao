import type { CadastroPortalRuntimeAdapter, CadastroPortalRuntimeContext } from "../cadastro/contracts";
import { isPesqBrasilUrl } from "./routes";

export class PesqBrasilPortalRuntime implements CadastroPortalRuntimeAdapter {
  readonly id = "pesqbrasil" as const;
  private govBrClickAttempted = false;

  run(context: CadastroPortalRuntimeContext): void {
    if (!context.sessionActive || !isPesqBrasilUrl(globalThis.location.href)) return;
    if (!this.govBrClickAttempted) {
      this.govBrClickAttempted = true;
      this.scheduleGovBrClick();
    }
    this.openProfessionalCard();
  }

  private scheduleGovBrClick(): void {
    const run = () => {
      const script = document.createElement("script");
      script.textContent = `
        (function() {
          var obs;
          function tryClick() {
            var button = document.querySelector('#button_____r0');
            if (!button || button.offsetParent === null) return false;
            if (obs) obs.disconnect();
            button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
            return true;
          }
          if (!tryClick()) {
            obs = new MutationObserver(function() { tryClick(); });
            obs.observe(document.documentElement, { childList: true, subtree: true });
            setTimeout(function() { if (obs) obs.disconnect(); }, 20000);
          }
        })();
      `;
      (document.head || document.documentElement).appendChild(script);
      script.remove();
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
  }

  private openProfessionalCard(): void {
    const click = () => {
      const card = document.querySelector<HTMLElement>("#card_____ra");
      if (!card) return false;
      card.click();
      return true;
    };
    if (click()) return;
    const observer = new MutationObserver(() => {
      if (click()) observer.disconnect();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    setTimeout(() => observer.disconnect(), 30000);
  }
}
