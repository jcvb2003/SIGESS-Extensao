import type { CadastroPortalRuntimeAdapter, CadastroPortalRuntimeContext } from "../cadastro/contracts";
import { isEsocialCadastroDomesticoUrl, isEsocialHomeUrl } from "./routes";
import { reportCadastroPortalOutcome } from "../cadastro/portal-outcome-reporter";

/** Confirma a navegação autenticada do eSocial quando o redirect não gera um
 * evento de navegação útil para o background. */
export class ESocialPortalRuntime implements CadastroPortalRuntimeAdapter {
  readonly id = "esocial" as const;
  private authenticatedReported = false;
  private caepfNotFoundReported = false;

  run({ sessionActive }: CadastroPortalRuntimeContext): void {
    const currentUrl = globalThis.location.href;
    if (!sessionActive) return;
    if (isEsocialCadastroDomesticoUrl(currentUrl)) {
      if (this.caepfNotFoundReported) return;
      this.caepfNotFoundReported = true;
      reportCadastroPortalOutcome("esocial", "not_found", "url_cadastro_domestico");
      return;
    }
    this.caepfNotFoundReported = false;
    if (!isEsocialHomeUrl(currentUrl) || this.authenticatedReported) return;
    this.authenticatedReported = true;
    void (globalThis.browser || globalThis.chrome).runtime.sendMessage({ action: "esocialAuthenticated" });
  }
}
