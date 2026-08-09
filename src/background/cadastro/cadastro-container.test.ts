import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StorageService } from "../services/storage";
import {
  closeCadastroContainerTabs,
  prepareCadastroContainer,
  sanitizeCadastroContainer,
} from "./cadastro-container";

const CONTAINER_KEY = "sigessCadastroAutomaticoContainerId";

describe("container persistente do cadastro automático", () => {
  const contextualIdentities = {
    get: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  };
  const tabs = {
    query: vi.fn(),
    remove: vi.fn(),
  };
  const browsingData = { remove: vi.fn() };
  const cookies = { getAll: vi.fn() };

  beforeEach(() => {
    vi.clearAllMocks();
    contextualIdentities.get.mockResolvedValue({ cookieStoreId: "firefox-container-10" });
    contextualIdentities.create.mockResolvedValue({ cookieStoreId: "firefox-container-11" });
    contextualIdentities.remove.mockResolvedValue(undefined);
    tabs.query.mockResolvedValue([]);
    tabs.remove.mockResolvedValue(undefined);
    browsingData.remove.mockResolvedValue(undefined);
    cookies.getAll.mockResolvedValue([]);
    (globalThis as any).browser = { contextualIdentities, tabs, browsingData, cookies };
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).browser;
  });

  it("reutiliza o container registrado e preserva os caches", async () => {
    vi.spyOn(StorageService, "get").mockResolvedValue({ [CONTAINER_KEY]: "firefox-container-10" });
    vi.spyOn(StorageService, "set").mockResolvedValue(undefined);
    vi.spyOn(StorageService, "remove").mockResolvedValue(undefined);

    await expect(prepareCadastroContainer()).resolves.toBe("firefox-container-10");

    expect(contextualIdentities.create).not.toHaveBeenCalled();
    expect(browsingData.remove).toHaveBeenCalledWith(
      { cookieStoreId: "firefox-container-10" },
      { cookies: true, indexedDB: true, localStorage: true },
    );
  });

  it("recria o container quando a limpeza seletiva não é confiável", async () => {
    vi.spyOn(StorageService, "get").mockResolvedValue({ [CONTAINER_KEY]: "firefox-container-10" });
    vi.spyOn(StorageService, "set").mockResolvedValue(undefined);
    vi.spyOn(StorageService, "remove").mockResolvedValue(undefined);
    browsingData.remove.mockRejectedValueOnce(new Error("falha de limpeza"));

    await expect(prepareCadastroContainer()).resolves.toBe("firefox-container-11");

    expect(contextualIdentities.remove).toHaveBeenCalledWith("firefox-container-10");
    expect(contextualIdentities.create).toHaveBeenCalledOnce();
  });

  it("não altera um container legado que não pertence ao módulo persistente", async () => {
    vi.spyOn(StorageService, "get").mockResolvedValue({ [CONTAINER_KEY]: "firefox-container-10" });

    await sanitizeCadastroContainer("firefox-container-legacy");

    expect(browsingData.remove).not.toHaveBeenCalled();
    expect(contextualIdentities.remove).not.toHaveBeenCalled();
  });

  it("fecha todas as abas do container mesmo quando uma já foi encerrada", async () => {
    tabs.query.mockResolvedValue([{ id: 91 }, { id: 92 }, { id: 93 }]);
    tabs.remove
      .mockRejectedValueOnce(new Error("aba já encerrada"))
      .mockResolvedValue(undefined);

    await closeCadastroContainerTabs("firefox-container-10");

    expect(tabs.remove).toHaveBeenNthCalledWith(1, 91);
    expect(tabs.remove).toHaveBeenNthCalledWith(2, 92);
    expect(tabs.remove).toHaveBeenNthCalledWith(3, 93);
  });
});
