import { isCadUnicoLocation } from "./routes";
import type { CadastroPortalRuntimeAdapter, CadastroPortalRuntimeContext } from "../cadastro/contracts";

export class CadUnicoPortalRuntime implements CadastroPortalRuntimeAdapter {
  readonly id = "cadunico" as const;
  private govBrClickAttempted = false;
  private termsAttempted = false;

  run({ sessionActive }: CadastroPortalRuntimeContext): void {
    if (!sessionActive || !isCadUnicoLocation(globalThis.location)) return;

    if (!globalThis.location.href.includes("successLogin") && !this.govBrClickAttempted) {
      this.govBrClickAttempted = true;
      runWhenDocumentReady(clickCadUnicoGovBr);
    }

    if (globalThis.location.hash === "#/home" && !this.termsAttempted) {
      this.termsAttempted = true;
      runWhenDocumentReady(acceptCadUnicoTerms);
    }
  }
}

function runWhenDocumentReady(action: () => void): void {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", action, { once: true });
  } else {
    action();
  }
}

function injectMainWorld(source: string): void {
  const script = document.createElement("script");
  script.textContent = source;
  (document.head || document.documentElement).appendChild(script);
  script.remove();
}

function clickCadUnicoGovBr(): void {
  injectMainWorld(`
    (function() {
      var selectors = ["button.br-button[class*='botaoGovBr']", ".br-button.botaoGovBr"];
      var observer;
      function findButton() {
        for (var i = 0; i < selectors.length; i++) {
          var button = document.querySelector(selectors[i]);
          if (button && button.offsetParent !== null) return button;
        }
        return null;
      }
      function click() {
        var button = findButton();
        if (!button) return false;
        if (observer) observer.disconnect();
        button.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        return true;
      }
      if (!click()) {
        observer = new MutationObserver(click);
        observer.observe(document.documentElement, { childList: true, subtree: true });
        setTimeout(function() { if (observer) observer.disconnect(); }, 20000);
      }
    })();
  `);
}

function acceptCadUnicoTerms(): void {
  injectMainWorld(`
    (function() {
      var observer;
      function accept() {
        var button = document.querySelector('#botaoLiConcordo');
        if (!button || button.offsetParent === null) return false;
        if (observer) observer.disconnect();
        button.click();
        return true;
      }
      if (!accept()) {
        observer = new MutationObserver(accept);
        observer.observe(document.documentElement, { childList: true, subtree: true });
      }
    })();
  `);
}
