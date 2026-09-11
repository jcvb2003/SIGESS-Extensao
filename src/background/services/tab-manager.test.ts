import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageService } from "./storage";
import { TabManager } from "./tab-manager";

describe("TabManager sessão de lote GOV", () => {
  const contextualIdentities = {
    create: vi.fn(),
  };
  const tabs = {
    create: vi.fn(),
    update: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    contextualIdentities.create.mockResolvedValue({ cookieStoreId: "firefox-container-21" });
    tabs.create.mockResolvedValue({ id: 21 });
    tabs.update.mockResolvedValue(undefined);
    (globalThis as any).browser = { contextualIdentities, tabs };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).browser;
  });

  it("persiste o automationRunId na credencial da aba", async () => {
    const set = vi.spyOn(StorageService, "set").mockResolvedValue(undefined);

    await new TabManager().createSession(
      "https://login.esocial.gov.br/",
      "710.609.262-29",
      "senha",
      1,
      "Gisele Barbosa Borges",
      "esocial",
      undefined,
      false,
      true,
      undefined,
      undefined,
      undefined,
      "run-21",
    );

    const credentialPayload = set.mock.calls.find(([payload]) =>
      Object.prototype.hasOwnProperty.call(payload, "credenciais_21"),
    )?.[0] as { credenciais_21?: { automationRunId?: string } } | undefined;

    expect(credentialPayload?.credenciais_21?.automationRunId).toBe("run-21");
  });
});
