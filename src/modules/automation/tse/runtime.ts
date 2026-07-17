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
      void this.dependencies.canSubmit().then((submit) => fillTseAuthForm(profile, { submit }));
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
