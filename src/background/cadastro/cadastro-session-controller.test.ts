import { describe, expect, it } from "vitest";
import type { CadastroSession } from "../../shared/types";
import {
  isCadastroCollectionComplete,
  isCadastroSessionReadyToFinalize,
} from "./cadastro-session-controller";

function createCompletedSession(): CadastroSession {
  return {
    sessionId: "session",
    cookieStoreId: "container",
    sessionState: "active",
    startedAt: 1,
    portais: {
      cadunico: { status: "indisponivel", evidence: "confirmacao_contato_pendente" },
      pesqbrasil: { status: "concluido" },
      esocial: { status: "concluido" },
      inss: { status: "concluido" },
      tse: { status: "dispensado" },
    },
  };
}

describe("finalização da sessão de cadastro", () => {
  it("aguarda a dispensa explícita do CadÚnico na contingência de contato", () => {
    const session = createCompletedSession();
    session.cadunicoDismissalRequired = true;

    expect(isCadastroCollectionComplete(session)).toBe(true);
    expect(isCadastroSessionReadyToFinalize(session)).toBe(false);
  });

  it("libera a finalização após dispensar o CadÚnico", () => {
    const session = createCompletedSession();

    expect(isCadastroSessionReadyToFinalize(session)).toBe(true);
  });
});
