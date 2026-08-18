import type { CadastroPortalRuntimeAdapter, CadastroPortalRuntimeContext } from "../cadastro/contracts";
import { isEsocialHomeUrl } from "./routes";

/** Confirma no DOM a Home autenticada quando o redirect do eSocial não gera
 * um evento de navegação útil para o background. */
export class ESocialPortalRuntime implements CadastroPortalRuntimeAdapter {
  readonly id = "esocial" as const;
  private authenticatedReported = false;

  run({ sessionActive }: CadastroPortalRuntimeContext): void {
    if (!sessionActive || !isEsocialHomeUrl(globalThis.location.href) || this.authenticatedReported) return;
    this.authenticatedReported = true;
    void (globalThis.browser || globalThis.chrome).runtime.sendMessage({ action: "esocialAuthenticated" });
  }
}
