import type { CadastroSession } from "../../../shared/types";

type CadastroPortalEntry = CadastroSession["portais"][keyof CadastroSession["portais"]];

const TERMINAL_PORTAL_STATUSES = new Set([
  "concluido",
  "dispensado",
  "nao_encontrado",
  "indisponivel",
  "erro",
]);

export function isCadastroPortalTerminal(portal: CadastroPortalEntry): boolean {
  return !!portal && TERMINAL_PORTAL_STATUSES.has(portal.status);
}
