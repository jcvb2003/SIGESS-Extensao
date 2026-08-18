import { describe, expect, it } from "vitest";
import { createCadastroCollectionEvent } from "./cadastro-event";
import type { CadastroSession, UserCredentials } from "../../shared/types";

const session: CadastroSession = {
  sessionId: "cadastro-atual",
  cookieStoreId: "firefox-container-1",
  sessionState: "active",
  startedAt: 1,
  portais: {
    cadunico: { status: "coletando", tabId: 1 },
    pesqbrasil: { status: "coletando", tabId: 2 },
    esocial: { status: "coletando", tabId: 3 },
  },
};

function credentials(overrides: Partial<UserCredentials> = {}): UserCredentials {
  return {
    cpf: "00000000000",
    senha: "senha",
    isCadastroAutomatico: true,
    cadastroSessionId: "cadastro-atual",
    portalType: "pesqbrasil_mpa",
    ...overrides,
  };
}

describe("createCadastroCollectionEvent", () => {
  it("correlaciona a coleta à aba e à sessão que a emitiu", () => {
    expect(createCadastroCollectionEvent(session, "pesqbrasil", 2, credentials())).toEqual({
      kind: "data_collected",
      sessionId: "cadastro-atual",
      portalId: "pesqbrasil",
      source: "pesqbrasil",
      sourceTabId: 2,
    });
  });

  it("rejeita evento de uma sessão anterior", () => {
    expect(createCadastroCollectionEvent(
      session,
      "pesqbrasil",
      2,
      credentials({ cadastroSessionId: "cadastro-antigo" }),
    )).toBeNull();
  });

  it("rejeita fonte incompatível com o portal da aba", () => {
    expect(createCadastroCollectionEvent(
      session,
      "ecac_caepf",
      2,
      credentials(),
    )).toBeNull();
  });
});
