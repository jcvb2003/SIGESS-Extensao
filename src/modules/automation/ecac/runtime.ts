import type { CadastroPortalRuntimeAdapter, CadastroPortalRuntimeContext } from "../cadastro/contracts";
import { saveCapturedPessoaData } from "../cadastro/capture-data-reporter";
import { scrapeEcacCaepfTable, scrapeEcacCpfData } from "./extractor";
import { isEcacAuthUrl, isEcacCaepfCollectionUrl, isEcacCpfCollectionUrl } from "./routes";

export class EcacPortalRuntime implements CadastroPortalRuntimeAdapter {
  readonly id = "ecac" as const;
  private govBrClickAttempted = false;

  run(context: CadastroPortalRuntimeContext): void {
    const url = globalThis.location.href;
    if (isEcacCpfCollectionUrl(url)) this.scheduleCpfScrape();
    if (isEcacCaepfCollectionUrl(url)) this.scheduleCaepfScrape();
    if (context.sessionActive && isEcacAuthUrl(url) && !this.govBrClickAttempted) {
      this.govBrClickAttempted = true;
      this.scheduleGovBrClick();
    }
  }

  handleMessage(message: unknown): boolean {
    if ((message as { action?: string })?.action !== "clickEcacGovBrButton") return false;
    this.injectGovBrClick();
    return true;
  }

  private scheduleCpfScrape(): void {
    const run = () => saveCapturedPessoaData(scrapeEcacCpfData() ?? {}, "ecac_cpf");
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run, { once: true });
    else run();
  }

  private scheduleCaepfScrape(): void {
    const run = () => saveCapturedPessoaData(scrapeEcacCaepfTable() ?? {}, "ecac_caepf");
    const waitForTable = () => {
      if (document.querySelector("table.tabela")) {
        run();
        return;
      }
      const observer = new MutationObserver(() => {
        if (!document.querySelector("table.tabela")) return;
        observer.disconnect();
        run();
      });
      observer.observe(document.documentElement, { childList: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", waitForTable, { once: true });
    else waitForTable();
  }

  private scheduleGovBrClick(): void {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.injectGovBrClick(), { once: true });
    } else {
      this.injectGovBrClick();
    }
  }

  private injectGovBrClick(): void {
    const script = document.createElement("script");
    script.textContent = `
      (function tryClickEcac(n) {
        if (n <= 0) return;
        var btn = document.querySelector("input[type='image']");
        if (!btn) { setTimeout(function() { tryClickEcac(n - 1); }, 500); return; }
        if (typeof hcaptcha === 'undefined') { setTimeout(function() { tryClickEcac(n - 1); }, 500); return; }
        if (!document.querySelector('iframe[src*="hcaptcha"]')) { setTimeout(function() { tryClickEcac(n - 1); }, 500); return; }
        btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      })(30);
    `;
    (document.head || document.documentElement).appendChild(script);
    script.remove();
  }
}
