import { describe, expect, it } from "vitest";
import type { CadastroSession, PessoaData } from "../../../shared/types";
import { projectCaptureStatuses } from "./status-projection";
import { hasMeaningfulSourceData } from "./source-projections";

function createSession(): CadastroSession {
  return {
    sessionId: "session",
    cookieStoreId: "container",
    sessionState: "active",
    startedAt: 1,
    portais: {
      cadunico: { status: "concluido" },
      pesqbrasil: { status: "coletando" },
      ecac: { status: "erro" },
      tse: { status: "dispensado", evidence: "dados_eleitorais_cadunico" },
    },
  };
}

describe("projeção canônica do status de coleta", () => {
  it("projeta estados da sessão sem inventar captura", () => {
    expect(projectCaptureStatuses({}, createSession())).toEqual({
      cadunico: "idle",
      tse: "idle",
      pesqbrasil: "waiting",
      caepf: "failed",
      ecac: "failed",
    });
  });

  it("faz a evidência persistida prevalecer sobre o estado transitório", () => {
    const data: PessoaData = {
      fontes: {
        pesqbrasil: { capturado: true, timestamp: 1 },
        ecac_caepf: { capturado: true, timestamp: 1 },
        tse: { capturado: true, timestamp: 1 },
      },
    };
    const projected = projectCaptureStatuses(data, createSession());
    expect(projected.pesqbrasil).toBe("collected");
    expect(projected.caepf).toBe("collected");
    expect(projected.ecac).toBe("failed");
    expect(projected.tse).toBe("collected");
  });

  it("só mantém TSE dispensado quando os três dados eleitorais existem", () => {
    const data: PessoaData = {
      tituloEleitor: "123456789012",
      zonaEleitoral: "001",
      secaoEleitoral: "002",
    };
    expect(projectCaptureStatuses(data, createSession()).tse).toBe("skipped");
  });

  it("representa a contingência do INSS no indicador do CadÚnico", () => {
    const data: PessoaData = {
      fontes: { inss: { capturado: true, timestamp: 1 } },
    };
    expect(projectCaptureStatuses(data).cadunico).toBe("collected");
  });

  it("encerra o e-CAC como nao encontrado quando a pesquisa CAEPF retorna vazia", () => {
    const session = createSession();
    session.portais.ecac = { status: "nao_encontrado", evidence: "caepf_pesquisa_vazia" };

    expect(projectCaptureStatuses({}, session)).toMatchObject({
      caepf: "not_found",
      ecac: "not_found",
    });
  });

  it("não considera payload vazio como dado capturado", () => {
    expect(hasMeaningfulSourceData({})).toBe(false);
    expect(hasMeaningfulSourceData({ nome: "" })).toBe(false);
    expect(hasMeaningfulSourceData({ nome: "MARIA" })).toBe(true);
    const data: PessoaData = {
      fontes: { pesqbrasil: { capturado: true, timestamp: 1 } },
    };
    expect(projectCaptureStatuses(data, undefined, { pesqbrasil: {} }).pesqbrasil).toBe("idle");
  });
});
