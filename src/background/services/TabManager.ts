import { StorageService } from "../utils/storage";
import {
  AuthStrategy,
  PesqBrasilStrategy,
  ESocialStrategy,
} from "./AuthStrategy";

export class TabManager {
  private strategies: AuthStrategy[] = [];
  private static readonly TAB_CONTAINER_PREFIX = "tab_container_";

  constructor() {
    this.strategies = [new PesqBrasilStrategy(), new ESocialStrategy()];
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
  ): Promise<void> {
    try {
      let tab: browser.tabs.Tab;

      if (this.supportsContextualIdentities()) {
        const container = await (browser as any).contextualIdentities.create({
          name: `SessÃ£o-${index}-${cpf.slice(-4)}`,
          color: "blue",
          icon: "fingerprint",
        });

        tab = await browser.tabs.create({
          url,
          cookieStoreId: container.cookieStoreId,
        });

        if (tab.id) {
          await this.saveTabContainer(tab.id, container.cookieStoreId);
        }
      } else {
        tab = await browser.tabs.create({ url });
      }

      if (tab.id) {
        await StorageService.saveCredentials(tab.id, {
          cpf,
          senha,
          loginConcluido: false,
        });
      }
    } catch (error) {
      console.error("Erro ao criar sessÃ£o:", error);
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

    if (containerId && this.supportsContextualIdentities()) {
      try {
        await (browser as any).contextualIdentities.remove(containerId);
        console.log(`Container ${containerId} removido para aba ${tabId}`);
      } catch (error) {
        console.error(`Erro ao remover container ${containerId}:`, error);
      }
    }
    await this.clearTabContainer(tabId);
  }
}
