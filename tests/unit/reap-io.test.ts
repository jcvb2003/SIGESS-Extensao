import { describe, it, expect } from "vitest";
import {
  createReapMpaExportPayload,
  parseReapMpaImportPayload,
} from "../../src/modules/reap-mpa/reap-io";
import { AppSettings } from "../../src/shared/types";

describe("REAP MPA I/O (Export & Import v2)", () => {
  const currentSettings: AppSettings = {
    cpf: "12345678900",
    senha: "SENHA_ULTRA_SECRETA_DO_GOV",
    pessoaData: {
      cpf: "12345678900",
      nome: "Fulano de Tal",
      dataDeNascimento: "1980-01-01",
    },
    mpaReferenceYear: "2025",
    mpaResidenceUF: 5,
    mpaResidenceMunicipio: 1500800,
    mpaWorkRelation: "Autônomo",
    mpaCommercializationStates: [5],
    mpaDefesoMonths: [1, 2, 3, 11, 12],
    mpaLocalPesca: 6,
    mpaMetodoPesca: 4,
    mpaUF: 5,
    mpaMunicipio: 1500800,
    mpaSpeciesCount: 4,
    mpaSpecies: [
      { id: 10, nome: "Tucunaré", kgMin: "20", kgMax: "50", priceMin: "11.00", priceMax: "15.00" },
    ],
    activeReapMpaPresetId: "preset-1",
    reapMpaPresets: [
      {
        id: "preset-1",
        name: "Preset Principal",
        settings: {
          mpaSpeciesCount: 4,
          mpaDefesoMonths: [1, 2, 3, 11, 12],
        },
      },
    ],
  };

  const pdfCaches = {
    "preset-1": {
      b64: "JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwo...",
      filename: "comprovante_reap.pdf",
    },
    "outro-cache-nao-reap": {
      b64: "CACHE_ESTRANHO...",
      filename: "estranho.pdf",
    },
  };

  it("exports v2 format containing only MPA settings and linked PDF, excluding sensitive data", () => {
    const exported = createReapMpaExportPayload(currentSettings, pdfCaches);

    expect(exported.version).toBe(2);
    expect(exported.format).toBe("sigess-reap-mpa-settings");
    expect(exported.activeReapMpaPresetId).toBe("preset-1");

    // Presets devem existir e conter APENAS mpa*
    expect(exported.reapMpaPresets).toHaveLength(1);
    expect(exported.reapMpaPresets[0].id).toBe("preset-1");
    expect((exported.reapMpaPresets[0].settings as any).cpf).toBeUndefined();
    expect((exported.reapMpaPresets[0].settings as any).senha).toBeUndefined();
    expect((exported.reapMpaPresets[0].settings as any).pessoaData).toBeUndefined();

    // Top-level settings não deve ter dados pessoais
    expect((exported.settings as any).cpf).toBeUndefined();
    expect((exported.settings as any).senha).toBeUndefined();
    expect((exported.settings as any).pessoaData).toBeUndefined();

    // PDF deve conter apenas o PDF vinculado ao preset do REAP MPA
    expect(exported.pdfs).toHaveLength(1);
    expect(exported.pdfs[0].presetId).toBe("preset-1");
    expect(exported.pdfs[0].fileName).toBe("comprovante_reap.pdf");
    expect(exported.pdfs[0].mimeType).toBe("application/pdf");
    expect(exported.pdfs[0].data).toBe("JVBERi0xLjQKJeLjz9MKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwo...");
  });

  it("imports v2 format correctly, merging presets and PDFs without overwriting existing local personal profile", () => {
    const exported = createReapMpaExportPayload(currentSettings, pdfCaches);

    const localProfileBeforeImport: AppSettings = {
      cpf: "99988877700",
      senha: "MINHA_SENHA_LOCAL",
      pessoaData: {
        cpf: "99988877700",
        nome: "Beltrano Local",
      },
      mpaReferenceYear: "2024",
    };

    const result = parseReapMpaImportPayload(exported, localProfileBeforeImport);

    // Perfil local deve ser preservado intacto
    expect(result.normalizedSettings.cpf).toBe("99988877700");
    expect(result.normalizedSettings.senha).toBe("MINHA_SENHA_LOCAL");
    expect(result.normalizedSettings.pessoaData?.nome).toBe("Beltrano Local");

    // Configurações do REAP devem ter sido aplicadas
    expect(result.normalizedSettings.reapMpaPresets).toHaveLength(1);
    expect(result.normalizedSettings.activeReapMpaPresetId).toBe("preset-1");

    // PDF deve ser extraído para o mapa de caches
    expect(result.pdfCaches["preset-1"]).toBeDefined();
    expect(result.pdfCaches["preset-1"].filename).toBe("comprovante_reap.pdf");
  });

  it("imports legacy v1 format sanitizing foreign credentials and extraneous PDF caches", () => {
    const legacyExport = {
      version: 1,
      format: "sigess-reap-mpa-settings",
      settings: {
        cpf: "VAZAMENTO_DE_CPF",
        senha: "VAZAMENTO_DE_SENHA",
        pessoaData: { cpf: "VAZAMENTO_DE_CPF", nome: "Vítima" },
        mpaReferenceYear: "2025",
        mpaDefesoMonths: [1, 2],
        mpaSpeciesCount: 1,
        reapMpaPresets: [
          {
            id: "preset-legado",
            name: "Legado",
            settings: {
              mpaSpeciesCount: 1,
              senha: "SENHA_DENTRO_DO_PRESET",
            },
          },
        ],
      },
      pdfCaches: {
        "preset-legado": {
          b64: "PDF_LEGADO_B64",
          filename: "defeso_legado.pdf",
        },
        "outro-cache-invalido": {
          b64: "PDF_ALHEIO",
          filename: "alheio.pdf",
        },
      },
    };

    const localProfile: AppSettings = {
      cpf: "MEU_CPF_LOCAL",
      senha: "MINHA_SENHA_LOCAL",
    };

    const result = parseReapMpaImportPayload(legacyExport, localProfile);

    // Jamais sobrescreve com dados vazados
    expect(result.normalizedSettings.cpf).toBe("MEU_CPF_LOCAL");
    expect(result.normalizedSettings.senha).toBe("MINHA_SENHA_LOCAL");
    expect(result.normalizedSettings.pessoaData).toBeUndefined();

    // Preset importado não contém a chave senha
    const importedPreset = result.normalizedSettings.reapMpaPresets?.find((p) => p.id === "preset-legado");
    expect(importedPreset).toBeDefined();
    expect((importedPreset?.settings as any).senha).toBeUndefined();

    // Apenas o PDF do preset válido foi importado; o alheio foi descartado
    expect(result.pdfCaches["preset-legado"]).toBeDefined();
    expect(result.pdfCaches["preset-legado"].filename).toBe("defeso_legado.pdf");
    expect(result.pdfCaches["preset-legado"].b64).toBe("PDF_LEGADO_B64");
    expect(result.pdfCaches["outro-cache-invalido"]).toBeUndefined();
    // Garante que chaves desconhecidas NUNCA são associadas, mesmo havendo apenas 1 preset
    expect(Object.keys(result.pdfCaches)).toEqual(["preset-legado"]);
  });
});
