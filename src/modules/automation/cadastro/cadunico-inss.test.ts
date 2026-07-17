import { describe, expect, it } from "vitest";
import { CADASTRO_PORTAL_REGISTRY } from "./portal-registry";
import { projectSourceFields } from "./source-projections";
import { resolveTseQueryProfile } from "./tse-query-profile";
import {
  CADUNICO_HOME_URL,
  isCadUnicoIncompleteSuccessLogin,
  isCadUnicoUrl,
} from "../cadunico/routes";
import { INSS_DATA_URL, INSS_LOGIN_URL, isInssDataUrl, isInssUrl } from "../inss/routes";

describe("adaptadores CadÚnico e Meu INSS", () => {
  it("mantém as rotas canônicas no registry", () => {
    expect(CADASTRO_PORTAL_REGISTRY.cadunico.entryUrl).toBe(CADUNICO_HOME_URL);
    expect(CADASTRO_PORTAL_REGISTRY.inss.entryUrl).toBe(INSS_LOGIN_URL);
    expect(CADASTRO_PORTAL_REGISTRY.inss.collectionUrl).toBe(INSS_DATA_URL);
    expect(isCadUnicoUrl(CADUNICO_HOME_URL)).toBe(true);
    expect(isInssUrl(INSS_LOGIN_URL)).toBe(true);
    expect(isInssDataUrl(INSS_DATA_URL)).toBe(true);
  });

  it("só reconhece successLogin incompleto na hash exata", () => {
    expect(isCadUnicoIncompleteSuccessLogin({
      hostname: "cadunico.dataprev.gov.br",
      hash: "#/successLogin",
    } as Location)).toBe(true);
    expect(isCadUnicoIncompleteSuccessLogin({
      hostname: "cadunico.dataprev.gov.br",
      hash: "#/successLogin?token=temporario",
    } as Location)).toBe(false);
  });

  it("projeta do INSS somente os campos permitidos no cadastro", () => {
    expect(projectSourceFields("inss", {
      nit: "123",
      nome: "PESSOA",
      dataDeNascimento: "2000-01-01",
      cpf: "00000000000",
      mae: "MAE",
      endereco: "RUA",
    })).toEqual({
      nit: "123",
      nome: "PESSOA",
      dataDeNascimento: "2000-01-01",
    });
  });

  it("usa o snapshot INSS somente para completar o perfil TSE", () => {
    const profile = resolveTseQueryProfile({
      pessoaData: { cpf: "11111111111" },
      pessoaData_raw: {
        inss: {
          dataDeNascimento: "2000-01-01",
          mae: "MAE",
          endereco: "RUA QUE NAO DEVE SER PROJETADA",
        },
      },
    });
    expect(profile).toMatchObject({
      cpf: "11111111111",
      dataDeNascimento: "2000-01-01",
      mae: "MAE",
      isSufficient: true,
    });
    expect(profile).not.toHaveProperty("endereco");
  });
});
