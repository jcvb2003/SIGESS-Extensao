import { describe, expect, it } from "vitest";
import type { CadastroSession } from "../../shared/types";
import {
  getCadastroFinalizationPhase,
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
    expect(getCadastroFinalizationPhase(session)).toBe("awaiting_cadunico_dismissal");
    expect(isCadastroSessionReadyToFinalize(session)).toBe(false);
  });

  it("libera a finalização após dispensar o CadÚnico", () => {
    const session = createCompletedSession();

    expect(isCadastroSessionReadyToFinalize(session)).toBe(true);
    expect(getCadastroFinalizationPhase(session)).toBe("ready_to_finalize");
  });

  it("distingue sessão em coleta de sessão já concluída", () => {
    const collecting = createCompletedSession();
    collecting.portais.esocial.status = "coletando";
    expect(getCadastroFinalizationPhase(collecting)).toBe("collecting");

    const complete = createCompletedSession();
    complete.sessionState = "complete";
    expect(getCadastroFinalizationPhase(complete)).toBe("complete");
  });
});
