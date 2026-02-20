import { TabManager } from './services/TabManager';
import { StorageService } from './utils/storage';
import { MessageRequest, MessageResponse } from '../shared/types';

const tabManager = new TabManager();

// Inicialização
(async () => {
    tabManager.init();
    console.log('SINPESCA Background Service Initialized');
})();

// Listener de Mensagens Centralizado
browser.runtime.onMessage.addListener(
    (message: MessageRequest, _sender, sendResponse: (response: MessageResponse) => void) => {

        // Wrapper assíncrono para responder corretamente
        const handleMessage = async () => {
            try {
                const action = message.action || (message as any).type;
                console.log('[DEBUG] Message received:', action, message);

                switch (action) {
                    case 'updateESocialSettings':
                        if (message.settings) {
                            const current = await StorageService.getSettings();
                            const newSettings = { ...current, ...message.settings };

                            // Lógica de exclusividade mútua
                            if (message.settings.consultarGuias && message.settings.gerarGps) {
                                if (message.settings.consultarGuias) newSettings.gerarGps = false;
                                else if (message.settings.gerarGps) newSettings.consultarGuias = false;
                            }

                            await StorageService.saveSettings(newSettings);
                            return { success: true, settings: newSettings };
                        }
                        return { success: false, error: 'Settings not provided' };

                    case 'startBatchLogin':
                        // Nova abordagem: Popup envia lista limpa de credenciais
                        // Payload: { action: 'startBatchLogin', type: 'pesqbrasil' | 'esocial', credentials: [{cpf, senha}] }
                        const { type, credentials } = message;

                        if (!credentials || !Array.isArray(credentials) || credentials.length === 0) {
                            return { success: false, error: 'Lista de credenciais vazia' };
                        }

                        const urlMap = {
                            'pesqbrasil': 'https://pesqbrasil-pescadorprofissional.agro.gov.br/',
                            'esocial': 'https://login.esocial.gov.br/'
                        };

                        const targetUrl = urlMap[type as keyof typeof urlMap];
                        if (!targetUrl) return { success: false, error: 'Tipo de login inválido' };

                        // Iniciar processo em lote
                        // Abrir abas sequencialmente ou paralelo? Original era Promise.all
                        const results = await Promise.all(credentials.map(async (cred, index) => {
                            await tabManager.createSession(targetUrl, cred.cpf, cred.senha, index + 1);
                        }));

                        return { success: true, count: results.length };

                    case 'abrirAbaContainer':
                        // Handler para solicitações vindas de páginas externas (via content script)
                        // Payload: { type: 'abrirAbaContainer', url, cpf, senha, ... }
                        const { url, cpf, senha } = message;

                        // Validar URL alvo (segurança básica)
                        if (!url || !url.startsWith('http')) {
                            return { success: false, error: 'URL inválida' };
                        }

                        // Reutilizar a lógica do TabManager para criar sessão isolada
                        // Gera um índice aleatório apenas para diferenciação visual no nome
                        const randIndex = Math.floor(Math.random() * 1000);
                        await tabManager.createSession(url, cpf, senha, randIndex);

                        return { success: true };

                    default:
                        // Ignora mensagens de outros tipos (como getPopupData/clearPopupData se não implementados ainda)
                        // Para evitar erro no console, retornamos false mas sem erro explícito se for desconhecido
                        // Mas como o content script espera resposta, mantemos o default
                        return { success: false, error: `Unknown action: ${message.action || (message as any).type}` };
                }
            } catch (error: any) {
                console.error('Background Message Handler Error:', error);
                return { success: false, error: error.message };
            }
        };

        handleMessage().then(sendResponse);
        return true; // Indica resposta assíncrona
    }
);

// Listener para automação via Hash URL (Ex: ...#cpf=123&senha=abc)
// Listener para automação via Hash URL (Ex: ...#cpf=123&senha=abc)
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
    // Debug absoluto: Logar tudo para ver o que o Firefox está enviando
    if (changeInfo.url || changeInfo.status) {
        console.log(`[DEBUG] Tab ${tabId} Updated:`, JSON.stringify(changeInfo));
    }

    // Hash changes might not trigger 'status: complete', but rather 'url' change
    const currentUrl = changeInfo.url || tab.url;
    if (!currentUrl) return;

    try {
        const url = new URL(currentUrl);
        if (url.hash && url.hash.includes('cpf=') && url.hash.includes('senha=')) {
            // Evitar loop infinito
            const isProcessing = await StorageService.get(`processing_${tabId}`);
            if (isProcessing[`processing_${tabId}`]) return;

            await StorageService.set({ [`processing_${tabId}`]: true });

            // Extrair credenciais
            const hashParams = url.hash.substring(1); // Remove #
            // const params = new URLSearchParams(hashParams); // Pode não funcionar se for malformado como #/login#cpf=...

            // Fallback regex se URLSearchParams falhar com multiplos hashes
            const cpfMatch = hashParams.match(/cpf=([^&]+)/);
            const senhaMatch = hashParams.match(/senha=([^&]+)/);

            const cpf = cpfMatch ? cpfMatch[1] : null;
            const senha = senhaMatch ? decodeURIComponent(senhaMatch[1]) : null;

            if (cpf && senha) {
                await StorageService.saveCredentials(tabId, { cpf, senha });

                // Limpar URL mantendo query params se houver, mas removendo hash
                // Usando currentUrl (que pode ser string) para split
                const cleanUrl = currentUrl.split('#')[0];
                await browser.tabs.update(tabId, { url: cleanUrl });
                // Ao atualizar a URL, o listener 'handleTabUpdate' do TabManager será acionado novamente.
                // Como as credenciais já foram salvas, ele deverá detectar e executar o AuthStrategy.
            }
        }
    } catch (e) {
        console.error('Hash Auto Error:', e);
    } finally {
        await StorageService.remove(`processing_${tabId}`);
    }
});
