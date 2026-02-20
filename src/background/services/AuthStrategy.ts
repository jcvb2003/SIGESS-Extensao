import { UserCredentials } from '../../shared/types';
import { DOMInjector } from '../utils/dom-injector';
import { StorageService } from '../utils/storage';

export interface AuthStrategy {
    name: string;
    urlTrigger: string; // URL substring that triggers this strategy
    execute(tabId: number, tabUrl: string, credentials: UserCredentials): Promise<void>;
}

export abstract class BaseAuthStrategy implements AuthStrategy {
    abstract name: string;
    abstract urlTrigger: string;
    abstract execute(tabId: number, tabUrl: string, credentials: UserCredentials): Promise<void>;

    async markLoginComplete(tabId: number): Promise<void> {
        const creds = await StorageService.getCredentials(tabId);
        if (creds) {
            creds.loginConcluido = true;
            await StorageService.saveCredentials(tabId, creds);
        }
    }

    async isLoginComplete(tabId: number): Promise<boolean> {
        const creds = await StorageService.getCredentials(tabId);
        return !!creds?.loginConcluido;
    }
}

export class PesqBrasilStrategy extends BaseAuthStrategy {
    name = 'PesqBrasil';
    urlTrigger = 'pesqbrasil-pescadorprofissional.agro.gov.br';

    async execute(tabId: number, tabUrl: string, credentials: UserCredentials): Promise<void> {
        if (tabUrl.includes("pesqbrasil-pescadorprofissional.agro.gov.br") && !tabUrl.includes('sso.acesso.gov.br')) {
            // Página inicial, clicar no botão de login
            try {
                await DOMInjector.waitForElement(tabId, '#button_____3', 5000);
                await DOMInjector.clickElement(tabId, '#button_____3');
            } catch (e) {
                // Se já estiver logado ou botão não aparecer, segue o baile
                console.log('Botão PesqBrasil não encontrado ou já clicado');
            }
        }

        if (tabUrl.includes("sso.acesso.gov.br/login")) {
            await this.handleGovBrLogin(tabId, credentials);
        }
    }

    private async handleGovBrLogin(tabId: number, creds: UserCredentials) {
        // Lógica unificada do Gov.br
        const isCpfScreen = await DOMInjector.execute(tabId, () => !!document.querySelector('#accountId'));
        const isPassScreen = await DOMInjector.execute(tabId, () => !!document.querySelector('#password'));

        if (isCpfScreen) {
            await DOMInjector.waitForElement(tabId, '#accountId');
            await DOMInjector.setInputValue(tabId, '#accountId', creds.cpf);
            await DOMInjector.clickElement(tabId, '#enter-account-id');
        } else if (isPassScreen) {
            await DOMInjector.waitForElement(tabId, '#password');
            await DOMInjector.setInputValue(tabId, '#password', creds.senha);
            await DOMInjector.clickElement(tabId, '#submit-button');
            await this.markLoginComplete(tabId);
        }
    }
}

export class ESocialStrategy extends BaseAuthStrategy {
    name = 'eSocial';
    urlTrigger = 'login.esocial.gov.br';

    async execute(tabId: number, tabUrl: string, credentials: UserCredentials): Promise<void> {
        if (tabUrl.includes(this.urlTrigger)) {
            try {
                // Tenta clicar no botão "Entrar com gov.br"
                await DOMInjector.waitForElement(tabId, '.br-button.sign-in', 5000);
                await DOMInjector.clickElement(tabId, '.br-button.sign-in');
            } catch (e) {
                // Pode já ter redirecionado
            }
        }

        if (tabUrl.includes("sso.acesso.gov.br/login")) {
            // Reusa a lógica do Gov.br (poderia ser extraída para um helper comum se for idêntica)
            // @ts-ignore - Acesso privado, mas vamos duplicar ou mover para helper na refatoração real
            // Para simplificar, vou duplicar a chamada segura aqui
            await this.handleGovBrLogin(tabId, credentials);
        }
    }

    private async handleGovBrLogin(tabId: number, creds: UserCredentials) {
        const isCpfScreen = await DOMInjector.execute(tabId, () => !!document.querySelector('#accountId'));
        const isPassScreen = await DOMInjector.execute(tabId, () => !!document.querySelector('#password'));

        if (isCpfScreen) {
            await DOMInjector.waitForElement(tabId, '#accountId');
            await DOMInjector.setInputValue(tabId, '#accountId', creds.cpf);
            await DOMInjector.clickElement(tabId, '#enter-account-id');
        } else if (isPassScreen) {
            await DOMInjector.waitForElement(tabId, '#password');
            await DOMInjector.setInputValue(tabId, '#password', creds.senha);
            await DOMInjector.clickElement(tabId, '#submit-button');
            await this.markLoginComplete(tabId);
        }
    }
}
