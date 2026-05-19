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
  private _containerQueueLock: Promise<void> = Promise.resolve();

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
  ): Promise<void> {
    try {
      const resolvedPortalType =
        portalType ||
        (url.includes("esocial") ? "esocial" : "pesqbrasil");

      let tab: browser.tabs.Tab;

      if (this.supportsContextualIdentities()) {
        const container = await (browser as any).contextualIdentities.create({
          name: nome || `Sessão-${index}-${cpf.slice(-4)}`,
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
          portalType: resolvedPortalType,
          loginConcluido: false,
          govBrCpfSubmitted: false,
          govBrPasswordSubmitted: false,
          status: "abrindo_sessao",
          lastUpdatedAt: Date.now(),
        });
      }
    } catch (error) {
      console.error("Erro ao criar sessão:", error);
    }
  }

  async handleTabUpdate(
    tabId: number,
    changeInfo: browser.tabs._OnUpdatedChangeInfo,
    tab: browser.tabs.Tab,
  ) {
    if (changeInfo.status !== "complete" && !changeInfo.url) return;
    if (!tab.url) return;

    const credentials = await StorageService.getCredentials(tabId);
    if (!credentials || credentials.loginConcluido) return;

    const strategy = this.strategies.find(
      (s) =>
        tab.url?.includes(s.urlTrigger) ||
        tab.url?.includes("sso.acesso.gov.br"),
    );

    if (strategy) {
      await strategy.execute(tabId, tab.url, credentials);
    }
  }

  async handleTabRemoval(
    tabId: number,
    _removeInfo: browser.tabs._OnRemovedRemoveInfo,
  ) {
    await StorageService.clearCredentials(tabId);
    const containerId = await this.getTabContainer(tabId);
    await this.clearTabContainer(tabId);

    if (containerId && this.supportsContextualIdentities()) {
      // Enfileira a operação para evitar race conditions no storage
      this.enqueueContainerOp(() => this.processContainerRetention(containerId));
    }
  }

  private async processContainerRetention(containerId: string): Promise<void> {
    try {
      const list = await this.getRecentContainers();
      
      // Move para o início (mais recente) e remove duplicatas
      const deduped = list.filter(id => id !== containerId);
      const updated = [containerId, ...deduped];

      // Se exceder 5, remove o mais antigo do Firefox e da lista
      if (updated.length > 5) {
        const oldestId = updated.pop();
        if (oldestId) {
          try {
            await (browser as any).contextualIdentities.remove(oldestId);
            console.log(`[SIGESS] Conteiner excedente ${oldestId} removido.`);
          } catch (e) {
            // Pode já ter sido removido manualmente ou não existir mais
            console.debug(`[SIGESS] Não foi possível remover conteiner ${oldestId}:`, e);
          }
        }
      }

      await this.saveRecentContainers(updated);
      console.log(`[SIGESS] Conteiner ${containerId} mantido na lista de recentes.`);
    } catch (error) {
      console.error("[SIGESS] Erro no processamento de retenção de conteiner:", error);
    }
  }
}
