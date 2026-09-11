import { describe, expect, it } from "vitest";
import { normalizeCpf } from "./normalize-cpf";

describe("normalizeCpf", () => {
  it("remove pontuação e mantém onze posições", () => {
    expect(normalizeCpf("710.609.262-29")).toBe("71060926229");
    expect(normalizeCpf("123456789")).toBe("00123456789");
  });

  it("retorna vazio quando não há dígitos", () => {
    expect(normalizeCpf(null)).toBe("");
    expect(normalizeCpf("abc")).toBe("");
  });
});
