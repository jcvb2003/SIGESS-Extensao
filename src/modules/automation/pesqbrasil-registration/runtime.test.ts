import { describe, expect, it } from "vitest";
import { formatMemberAddress } from "./runtime";
import type { PesqBrasilCadastroMemberData } from "./contracts";

describe("formatMemberAddress", () => {
  it("deve retornar string vazia para membro nulo ou indefinido", () => {
    expect(formatMemberAddress(null)).toBe("");
    expect(formatMemberAddress(undefined)).toBe("");
    expect(formatMemberAddress({})).toBe("");
  });

  it("deve formatar endereço completo em linha única", () => {
    const member: PesqBrasilCadastroMemberData = {
      endereco: "RUA CORONEL VITOR BASTOS",
      numero: "123",
      complemento: "APTO 101",
      bairro: "CENTRO",
      cidade: "OEIRAS DO PARÁ",
      uf: "PA",
      cep: "68470-000",
    };

    expect(formatMemberAddress(member)).toBe(
      "RUA CORONEL VITOR BASTOS, nº 123, APTO 101, Bairro: CENTRO, OEIRAS DO PARÁ-PA, CEP: 68470-000",
    );
  });

  it("deve formatar endereço com número SN e sem complemento", () => {
    const member: PesqBrasilCadastroMemberData = {
      endereco: "CORONEL VITOR BASTOS",
      numero: "SN",
      bairro: "MARITUBA",
      cidade: "Oeiras do Pará",
      uf: "PA",
      cep: "68470-000",
    };

    expect(formatMemberAddress(member)).toBe(
      "CORONEL VITOR BASTOS, nº SN, Bairro: MARITUBA, Oeiras do Pará-PA, CEP: 68470-000",
    );
  });

  it("deve lidar com campos ausentes graciosamente", () => {
    const member: PesqBrasilCadastroMemberData = {
      endereco: "AVENIDA BRASIL",
      cidade: "BELÉM",
      uf: "PA",
    };

    expect(formatMemberAddress(member)).toBe("AVENIDA BRASIL, BELÉM-PA");
  });

  it("deve lidar apenas com CEP e cidade", () => {
    const member: PesqBrasilCadastroMemberData = {
      cidade: "SANTARÉM",
      cep: "68000-000",
    };

    expect(formatMemberAddress(member)).toBe("SANTARÉM, CEP: 68000-000");
  });
});
