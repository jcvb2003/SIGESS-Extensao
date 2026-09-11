import { describe, expect, it, vi } from "vitest";
import { StorageService } from "./storage";

const CLOSED_STATUSES_KEY = "sigess_closed_gov_batch_statuses";

describe("StorageService status encerrado do lote GOV", () => {
  it("persiste o CPF canônico mesmo quando a credencial está formatada", async () => {
    const set = vi.spyOn(StorageService, "set").mockResolvedValue(undefined);

    await StorageService.saveClosedGovBatchStatus(
      {
        cpf: "710.609.262-29",
        senha: "senha",
        nome: "Gisele Barbosa Borges",
        portalType: "esocial",
        automationRunId: "run-18",
      },
      18,
    );

    const payload = set.mock.calls[0]?.[0] as Record<
      string,
      Array<{ cpf: string }>
    >;
    expect(payload[CLOSED_STATUSES_KEY]?.[0]?.cpf).toBe("71060926229");
    set.mockRestore();
  });

  it("substitui registros legados do mesmo CPF após normalização", async () => {
    const get = vi.spyOn(StorageService, "get").mockResolvedValue({
      [CLOSED_STATUSES_KEY]: [
        {
          tabId: 17,
          cpf: "710.609.262-29",
          status: "erro",
          statusTitle: "Aba fechada",
          statusDescription: "Aba fechada",
          loginConcluido: false,
          lastUpdatedAt: 1,
        },
      ],
    });
    const set = vi.spyOn(StorageService, "set").mockResolvedValue(undefined);

    await StorageService.saveClosedGovBatchStatus(
      {
        cpf: "71060926229",
        senha: "senha",
        portalType: "esocial",
        automationRunId: "run-18",
      },
      18,
    );

    const payload = set.mock.calls[0]?.[0] as Record<
      string,
      Array<{ tabId: number; cpf: string }>
    >;
    expect(payload[CLOSED_STATUSES_KEY]).toHaveLength(1);
    expect(payload[CLOSED_STATUSES_KEY]?.[0]).toMatchObject({
      tabId: 18,
      cpf: "71060926229",
    });
    get.mockRestore();
    set.mockRestore();
  });
});
