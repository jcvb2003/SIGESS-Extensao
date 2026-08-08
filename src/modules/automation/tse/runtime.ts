import type { CadastroPortalRuntimeAdapter, CadastroPortalRuntimeContext } from "../cadastro/contracts";
import { resolveTseQueryProfile } from "../cadastro/tse-query-profile";
import { fillTseAuthForm, resetTseFillGuard, validateTseResultRoute } from "./form-filler-tse";
import { isTseAutoatendimentoUrl, isTseUrl } from "./routes";

interface TseRuntimeDependencies {
  canSubmit(): Promise<boolean>;
}

export class TsePortalRuntime implements CadastroPortalRuntimeAdapter {
  readonly id = "tse" as const;

  constructor(private readonly dependencies: TseRuntimeDependencies) {}

  run(context: CadastroPortalRuntimeContext): void {
    const url = globalThis.location.href;
    if (!isTseUrl(url)) return;
    validateTseResultRoute(url);
    if (!isTseAutoatendimentoUrl(url)) return;

    const profile = resolveTseQueryProfile(context.settings || {});
    if (context.sessionActive) {
      if (!profile.isSufficient) return;
      void this.dependencies.canSubmit().then((submit) => {
        // Em uma sessão automática, uma resposta negativa é uma condição de
        // prontidão/autorização, não autorização para preencher sem enviar.
        // Consumir o guard do formulário nesse ponto faria a consulta nunca
        // ser repetida após a aba terminar de inicializar.
        if (!submit) return;
        fillTseAuthForm(profile, { submit: true });
      });
      return;
    }
    if (profile.cpf || profile.dataDeNascimento || profile.mae || profile.pai) {
      fillTseAuthForm(profile, { submit: false });
    }
  }

  reset(): void {
    resetTseFillGuard();
  }

  onNavigation(url: string): void {
    validateTseResultRoute(url);
  }
}
