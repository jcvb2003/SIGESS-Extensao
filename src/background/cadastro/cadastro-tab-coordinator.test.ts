import { describe, expect, it } from "vitest";
import { getCompletedCadastroPortalTabsExceptCadunico } from "./cadastro-tab-coordinator";
import type { CadastroSession } from "../../shared/types";

function session(): CadastroSession {
  return {
    sessionId: "sessao-1",
    cookieStoreId: "firefox-container-1",
    sessionState: "active",
    startedAt: 1,
    portais: {
      cadunico: { status: "indisponivel", tabId: 1 },
      pesqbrasil: { status: "concluido", tabId: 2 },
      esocial: { status: "coletando", tabId: 3 },
      inss: { status: "concluido", tabId: 4 },
      tse: { status: "dispensado", tabId: 5 },
    },
  };
}

describe("getCompletedCadastroPortalTabsExceptCadunico", () => {
  it("mantém CadÚnico e portais ainda em coleta fora do fechamento", () => {
    expect(getCompletedCadastroPortalTabsExceptCadunico(session())).toEqual([
      { portalId: "pesqbrasil", tabId: 2 },
      { portalId: "inss", tabId: 4 },
      { portalId: "tse", tabId: 5 },
    ]);
  });
});
