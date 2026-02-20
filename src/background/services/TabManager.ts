import { StorageService } from '../utils/storage';
import { AuthStrategy, PesqBrasilStrategy, ESocialStrategy } from './AuthStrategy';

export class TabManager {
    private strategies: AuthStrategy[] = [];
    private tabContainerMap = new Map<number, string>(); // tabId -> cookieStoreId

    constructor() {
        this.strategies = [
            new PesqBrasilStrategy(),
            new ESocialStrategy()
        ];
    }

    init() {
        browser.tabs.onUpdated.addListener(this.handleTabUpdate.bind(this));
        browser.tabs.onRemoved.addListener(this.handleTabRemoval.bind(this));
    }

    async createSession(url: string, cpf: string, senha: string, index: number): Promise<void> {
        try {
            const container = await browser.contextualIdentities.create({
                name: `Sessão-${index}-${cpf.slice(-4)}`,
                color: "blue",
                icon: "fingerprint"
            });

            const tab = await browser.tabs.create({
                url: url,
                cookieStoreId: container.cookieStoreId
            });

            if (tab.id) {
                this.tabContainerMap.set(tab.id, container.cookieStoreId);
                await StorageService.saveCredentials(tab.id, { cpf, senha, loginConcluido: false });
            }
        } catch (error) {
            console.error("Erro ao criar sessão:", error);
        }
    }

    private async handleTabUpdate(tabId: number, changeInfo: browser.tabs._OnUpdatedChangeInfo, tab: browser.tabs.Tab) {
        if (changeInfo.status !== 'complete' && !changeInfo.url) return;
        if (!tab.url) return;

        // Verificar se temos credenciais para essa aba
        const credentials = await StorageService.getCredentials(tabId);
        if (!credentials || credentials.loginConcluido) return;

        // Encontrar estratégia adequada
        const strategy = this.strategies.find(s => tab.url?.includes(s.urlTrigger) || tab.url?.includes("sso.acesso.gov.br"));

        if (strategy) {
            // Gov.br é comum a todos, então precisamos saber qual estratégia iniciou o fluxo
            // Na implementação real, poderíamos salvar o "tipo" de sessão no storage junto com credenciais
            // Por enquanto, vamos tentar executar a estratégia baseada no contexto ou fallback

            // Simplificação: Se estamos no SSO, executamos a lógica genérica de SSO que ambas estratégias têm
            await strategy.execute(tabId, tab.url, credentials);
        }
    }

    private async handleTabRemoval(tabId: number, _removeInfo: browser.tabs._OnRemovedRemoveInfo) {
        // Limpar credenciais
        await StorageService.clearCredentials(tabId);

        // Remover container associado
        const containerId = this.tabContainerMap.get(tabId);
        if (containerId) {
            try {
                await browser.contextualIdentities.remove(containerId);
                console.log(`Container ${containerId} removido para aba ${tabId}`);
            } catch (error) {
                console.error(`Erro ao remover container ${containerId}:`, error);
            }
            this.tabContainerMap.delete(tabId);
        }
    }
}
