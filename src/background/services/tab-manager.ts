import { StorageService } from "./storage";
import {
  AuthStrategy,
  PesqBrasilStrategy,
  ESocialStrategy,
} from "./auth-strategy";

export class TabManager {
  private readonly strategies: AuthStrategy[] = [];
  private static readonly TAB_CONTAINER_PREFIX = "tab_container_";
  private static readonly RECENT_CONTAINERS_KEY = "sigessRecentContainers";
  private static readonly PENDING_TAB_RECHECK_MS = 15000;
  private _containerQueueLock: Promise<void> = Promise.resolve();
  private readonly processingTabs = new Set<number>();

  constructor() {
    this.strategies = [new PesqBrasilStrategy(), new ESocialStrategy()];
  }

  private enqueueContainerOp(fn: () => Promise<void>): Promise<void> {
    this._containerQueueLock = this._containerQueueLock.then(() => fn()).catch(() => {});
    return this._containerQueueLock;
  }

  private async getRecentContainers(): Promise<string[]> {
    const result = await StorageService.get<string[]>(TabManager.RECENT_CONTAINERS_KEY);
    return result[TabManager.RECENT_CONTAINERS_KEY] || [];
  }

  private async saveRecentContainers(containers: string[]): Promise<void> {
    await StorageService.set({ [TabManager.RECENT_CONTAINERS_KEY]: containers });
  }

  private supportsContextualIdentities(): boolean {
    return Boolean((browser as any)?.contextualIdentities);
  }

  private getTabContainerKey(tabId: number): string {
    return `${TabManager.TAB_CONTAINER_PREFIX}${tabId}`;
  }

  private async saveTabContainer(tabId: number, containerId: string) {
    await StorageService.set({ [this.getTabContainerKey(tabId)]: containerId });
  }

  private async getTabContainer(tabId: number): Promise<string | null> {
    const key = this.getTabContainerKey(tabId);
    const result = await StorageService.get<string>(key);
    return result[key] || null;
  }

  private async clearTabContainer(tabId: number) {
    await StorageService.remove(this.getTabContainerKey(tabId));
  }

  async createSession(
    url: string,
    cpf: string,
    senha: string,
    index: number,
    nome?: string,
    portalType?: "pesqbrasil" | "esocial",
    valorComercializado?: string,
  ): Promise<void> {
    try {
      const resolvedPortalType =
        portalType ||
        (url.includes("esocial") ? "esocial" : "pesqbrasil");

      let tab: browser.tabs.Tab;

      if (this.supportsContextualIdentities()) {
        const container = await (browser as any).contextualIdentities.create({
          name: nome || `Sessao-${index}-${cpf.slice(-4)}`,
          color: "blue",
          icon: "fingerprint",
        });

        tab = await browser.tabs.create({
          url,
          cookieStoreId: container.cookieStoreId,
          active: false,
        });

        if (tab.id) {
          await this.saveTabContainer(tab.id, container.cookieStoreId);
        }
      } else {
        tab = await browser.tabs.create({
          url,
          active: false,
        });
      }

      if (tab.id) {
        await StorageService.saveCredentials(tab.id, {
          cpf,
          senha,
          nome,
          valorComercializado,
          portalType: resolvedPortalType,
          loginConcluido: false,
          govBrCpfSubmitted: false,
          govBrPasswordSubmitted: false,
          status: "abrindo_em_lote",
          statusTitle: "Abrindo em lote",
          statusDescription: "Abrindo aba para autenticacao...",
          lastUpdatedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error("Erro ao criar sessao:", error);
    }
  }

  async handleTabUpdate(
    tabId: number,
    changeInfo: browser.tabs._OnUpdatedChangeInfo,
    tab: browser.tabs.Tab,
  ) {
    if (!tab.url) return;

    const credentials = await StorageService.getCredentials(tabId);
    if (!credentials || credentials.loginConcluido) return;

    if (changeInfo.status === "loading" || changeInfo.url) {
      await this.markTabAsAwaitingPage(tabId, tab.url);
    }

    if (changeInfo.status !== "complete" && !changeInfo.url) return;

    const strategy = this.strategies.find(
      (s) =>
        tab.url?.includes(s.urlTrigger) ||
        tab.url?.includes("sso.acesso.gov.br"),
    );

    if (strategy) {
      await this.executeWithRetry(tabId, tab.url, credentials, strategy);
    }
  }

  async handleTabActivated(tabId: number): Promise<void> {
    try {
      const tab = await browser.tabs.get(tabId);
      const credentials = await StorageService.getCredentials(tabId);
      if (!tab.url || !credentials || credentials.loginConcluido) return;

      if (tab.status === "complete") {
        await this.handleTabUpdate(tabId, { status: "complete" }, tab);
        return;
      }

      await this.markTabAsAwaitingPage(tabId, tab.url);
    } catch (error) {
      console.debug("[SIGESS] Falha ao reavaliar aba ativada:", error);
    }
  }

  async recheckPendingTabs(): Promise<void> {
    const allCredentials = await StorageService.getAllCredentials();
    const now = Date.now();

    for (const [key, credentials] of Object.entries(allCredentials)) {
      const tabId = Number(key.replace("credenciais_", ""));
      if (!Number.isFinite(tabId) || credentials.loginConcluido) continue;
      if (credentials.status === "concluido" || credentials.status === "erro" || credentials.status === "ignorado") continue;
      if (this.processingTabs.has(tabId)) continue;

      const staleFor = now - (credentials.lastUpdatedAt || 0);
      if (staleFor < TabManager.PENDING_TAB_RECHECK_MS) continue;

      try {
        const tab = await browser.tabs.get(tabId);
        if (!tab.url) continue;

        if ((tab as browser.tabs.Tab & { discarded?: boolean }).discarded) {
          await StorageService.updateBatchStatus(
            tabId,
            "aguardando_pagina",
            "Recarregando aba",
            "A aba estava suspensa. Recarregando para retomar a automacao...",
          );
          await browser.tabs.reload(tabId);
          continue;
        }

        if (tab.status === "complete") {
          await this.handleTabUpdate(tabId, { status: "complete" }, tab);
          continue;
        }

        await StorageService.updateBatchStatus(
          tabId,
          "aguardando_pagina",
          "Aguardando carregamento",
          "Reavaliando aba pendente sem interacao manual...",
        );
      } catch (error) {
        console.debug(`[SIGESS] Falha ao reavaliar aba pendente ${tabId}:`, error);
      }
    }
  }

  private async executeWithRetry(
    tabId: number,
    tabUrl: string,
    credentials: any,
    strategy: any,
    maxRetries = 3,
  ): Promise<void> {
    if (this.processingTabs.has(tabId)) {
      return;
    }

    this.processingTabs.add(tabId);

    try {
      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
          await strategy.execute(tabId, tabUrl, credentials);
          return;
        } catch (error) {
          if (attempt === maxRetries) {
            console.error(`[TabManager] Falha na execucao apos ${maxRetries} tentativas:`, error);
            await strategy.updateStatus(tabId, "erro", "Erro no Login", String(error));
            return;
          }
          const delayMs = 1000 * attempt;
          console.log(`[TabManager] Tentativa ${attempt} falhou, aguardando ${delayMs}ms antes de retry...`);
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }
    } finally {
      this.processingTabs.delete(tabId);
    }
  }

  private async markTabAsAwaitingPage(tabId: number, url: string): Promise<void> {
    const credentials = await StorageService.getCredentials(tabId);
    if (!credentials || credentials.loginConcluido) return;

    const currentStatus = credentials.status || "abrindo_em_lote";
    if (currentStatus === "fazendo_login" || currentStatus === "acessando_esocial") {
      return;
    }

    const host = this.extractHostLabel(url);
    await StorageService.updateBatchStatus(
      tabId,
      "aguardando_pagina",
      "Aguardando página",
      host ? `Carregando ${host} para iniciar a automacao...` : "Aguardando a pagina ficar pronta...",
    );
  }

  async triggerReloginForTab(tabId: number): Promise<void> {
    const tab = await browser.tabs.get(tabId);
    if (!tab.url) return;

    await StorageService.updateCredentials(tabId, {
      loginConcluido: false,
      govBrCpfSubmitted: false,
      govBrPasswordSubmitted: false,
    });

    const credentials = await StorageService.getCredentials(tabId);
    if (!credentials) return;

    const portalType = credentials.portalType || "pesqbrasil";
    const strategy = this.strategies.find((s) =>
      portalType === "esocial" ? s.name === "eSocial" : s.name === "PesqBrasil",
    );
    if (!strategy) return;

    await this.executeWithRetry(tabId, tab.url, credentials, strategy);
  }

  private extractHostLabel(url: string): string {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  }

  async handleTabRemoval(
    tabId: number,
    _removeInfo: browser.tabs._OnRemovedRemoveInfo,
  ) {
    await StorageService.clearCredentials(tabId);
    const containerId = await this.getTabContainer(tabId);
    await this.clearTabContainer(tabId);
    this.processingTabs.delete(tabId);

    if (containerId && this.supportsContextualIdentities()) {
      this.enqueueContainerOp(() => this.processContainerRetention(containerId));
    }
  }

  private async processContainerRetention(containerId: string): Promise<void> {
    try {
      const list = await this.getRecentContainers();
      const deduped = list.filter((id) => id !== containerId);
      const updated = [containerId, ...deduped];

      if (updated.length > 5) {
        const oldestId = updated.pop();
        if (oldestId) {
          try {
            await (browser as any).contextualIdentities.remove(oldestId);
            console.log(`[SIGESS] Conteiner excedente ${oldestId} removido.`);
          } catch (e) {
            console.debug(`[SIGESS] Nao foi possivel remover conteiner ${oldestId}:`, e);
          }
        }
      }

      await this.saveRecentContainers(updated);
      console.log(`[SIGESS] Conteiner ${containerId} mantido na lista de recentes.`);
    } catch (error) {
      console.error("[SIGESS] Erro no processamento de retencao de conteiner:", error);
    }
  }
}
