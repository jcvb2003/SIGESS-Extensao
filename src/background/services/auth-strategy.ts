import { UserCredentials } from "../../shared/types";
import { DOMInjector } from "./dom-injector";
import { StorageService } from "./storage";
import { CADUNICO_HOST } from "../../modules/automation/cadunico/routes";
import { INSS_HOST, isInssUrl } from "../../modules/automation/inss/routes";
import { ECAC_HOST, isEcacAuthUrl, isEcacUrl } from "../../modules/automation/ecac/routes";
import {
  PESQBRASIL_AGRO_HOST,
  PESQBRASIL_MPA_HOST,
  isPesqBrasilMpaUrl,
} from "../../modules/automation/pesqbrasil/routes";

declare var browser: any;

export interface AuthStrategy {
  name: string;
  urlTrigger: string;
  execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void>;
}

export abstract class BaseAuthStrategy implements AuthStrategy {
  abstract name: string;
  abstract urlTrigger: string;
  abstract execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void>;

  async updateStatus(
    tabId: number,
    status: string,
    title: string,
    description: string,
  ): Promise<void> {
    const creds = await StorageService.getCredentials(tabId);
    if (creds) {
      creds.status = status as any;
      creds.statusTitle = title;
      creds.statusDescription = description;
      creds.lastUpdatedAt = Date.now();
      await StorageService.saveCredentials(tabId, creds);
    }
  }

  async markLoginComplete(tabId: number): Promise<void> {
    const creds = await StorageService.getCredentials(tabId);
    if (creds) {
      creds.loginConcluido = true;
      creds.status = "acessando_esocial";
      creds.statusTitle = "Acessando o E-social";
      creds.statusDescription = "Conectando ao portal de serviços...";
      creds.lastUpdatedAt = Date.now();
      await StorageService.saveCredentials(tabId, creds);
      console.log(`[Auth] markLoginComplete executada para tabId=${tabId}`);
    }
  }

  async setBoletoInfo(
    tabId: number,
    detectado: boolean,
    competencia?: string,
    valorComercializado?: number,
    valorDeclarado?: number,
    valorPago?: number,
    gerado?: boolean,
  ): Promise<void> {
    const creds = await StorageService.getCredentials(tabId);
    if (creds) {
      creds.boletoInfo = { detectado, competencia, valorComercializado, valorDeclarado, valorPago };
      if (gerado !== undefined) {
        creds.boletoGerado = gerado;
      }
      creds.lastUpdatedAt = Date.now();
      await StorageService.saveCredentials(tabId, creds);
    }
  }

  async isLoginComplete(tabId: number): Promise<boolean> {
    const creds = await StorageService.getCredentials(tabId);
    return !!creds?.loginConcluido;
  }

  protected async handleGovBrLogin(
    tabId: number,
    creds: UserCredentials,
  ): Promise<void> {
    await this.updateStatus(tabId, "fazendo_login", "Fazendo Login", "Preenchendo credenciais no Gov.BR...");

    const storedCreds = (await StorageService.getCredentials(tabId)) || creds;
    const passwordSubmitted = !!storedCreds.govBrPasswordSubmitted;

    const activeScreen = await DOMInjector.execute(
      tabId,
      () => {
        const selectors = [
          ".br-message.warning",
          "#accountId",
          "#password",
          "#twoFactorForm input[name='otpInput']",
          "#enter-offline-2fa-code",
        ];
        return selectors.find((selector) => {
          const element = document.querySelector(selector) as HTMLElement | null;
          return Boolean(element && element.offsetParent !== null);
        }) || null;
      },
    );
    if (!activeScreen) return;
    if (activeScreen === ".br-message.warning") throw new Error("govbr_senha_invalida");

    const isTwoFactorScreen = activeScreen === "#twoFactorForm input[name='otpInput']" ||
      activeScreen === "#enter-offline-2fa-code";

    if (isTwoFactorScreen) {
      await this.markTwoFactorPending(tabId);
      return;
    }

    const isCpfScreen = activeScreen === "#accountId";
    const isPassScreen = activeScreen === "#password";

    if (isCpfScreen) {
      try {
        // Returning to CPF after a password submission can indicate an invalid
        // password. Do not resubmit credentials and risk locking the account.
        // Before that point, CPF remains recoverable after a reload or a stalled
        // transition to the password screen.
        if (passwordSubmitted) {
          await this.updateStatus(
            tabId,
            "erro",
            "Login interrompido",
            "O Gov.br retornou para a tela de CPF. Verifique as credenciais antes de tentar novamente.",
          );
          return;
        }

        await DOMInjector.setInputValue(tabId, "#accountId", creds.cpf);
        const hcaptchaReady = await DOMInjector.execute(
          tabId,
          () => Boolean(document.querySelector('iframe[src*="hcaptcha"]')),
        );
        if (!hcaptchaReady) return;
        await DOMInjector.clickElement(tabId, "#enter-account-id");
        await StorageService.updateCredentials(tabId, {
          govBrCpfSubmitted: true,
        });
      } catch (e) {
        console.log(`[Auth] Erro ao preencher CPF:`, e);
        throw e;
      }
    } else if (isPassScreen) {
      try {
        if (!passwordSubmitted) {
          await this.submitGovBrPassword(tabId, creds.senha);
        } else {
          await this.updateStatus(
            tabId,
            "fazendo_login",
            "Aguardando redirecionamento",
            "Aguardando a confirmação do Gov.br para acessar o portal...",
          );
        }
      } catch (e) {
        console.log(`[Auth] Erro ao preencher senha:`, e);
        throw e;
      }
    }
  }

  private async submitGovBrPassword(tabId: number, senha: string): Promise<void> {
    await DOMInjector.setInputValue(tabId, "#password", senha);
    await StorageService.updateCredentials(tabId, { govBrPasswordSubmitted: true });
    await DOMInjector.clickElement(tabId, "#submit-button");

    await this.updateStatus(
      tabId,
      "fazendo_login",
      "Aguardando redirecionamento",
      "Aguardando a confirmação do Gov.br para acessar o portal...",
    );
  }

  private async markTwoFactorPending(tabId: number): Promise<void> {
    const storedCreds = await StorageService.updateCredentials(tabId, { govBrTwoFactorPending: true });
    if (storedCreds?.isCadastroAutomatico) {
      await StorageService.updateCadastroInteraction(storedCreds.cadastroSessionId, {
        type: "govbr_2fa",
        message: "Verificação de 2 etapas ativada. Aguardando código...",
        tabId,
      });
    }
    await this.updateStatus(
      tabId,
      "aguardando_2fa",
      "Aguardando código 2FA",
      "Informe e confirme o código de seis dígitos gerado no aplicativo gov.br.",
    );
  }
}

export class PesqBrasilStrategy extends BaseAuthStrategy {
  name = "PesqBrasil";
  urlTrigger = PESQBRASIL_AGRO_HOST;

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      tabUrl.includes(PESQBRASIL_AGRO_HOST) &&
      !tabUrl.includes("sso.acesso.gov.br") &&
      credentials.status !== "fazendo_login"
    ) {
      try {
        await DOMInjector.waitForElement(tabId, "#button_____3", 12000);
        await new Promise(r => setTimeout(r, 500));
        await DOMInjector.clickElement(tabId, "#button_____3");
        await this.updateStatus(tabId, "fazendo_login", "Fazendo Login", "Redirecionando para Gov.BR...");
      } catch (e) {
        console.log("Botao PesqBrasil nao encontrado ou ja clicado");
      }
    }

    if (tabUrl.includes("sso.acesso.gov.br/login")) {
      await this.handleGovBrLogin(tabId, credentials);
    }

    // O Meu INSS pode concluir o retorno do Gov.br sem outro evento de navegação.
    // A rota fora de #/login já é a área autenticada do portal.
    if (
      isInssUrl(tabUrl) &&
      !tabUrl.includes("#/login") &&
      !tabUrl.includes("sso.acesso.gov.br")
    ) {
      await this.markLoginComplete(tabId);
    }
  }
}

export class MTEStrategy extends BaseAuthStrategy {
  name = "MTE";
  urlTrigger = "servicos.mte.gov.br";

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      tabUrl.includes("servicos.mte.gov.br") &&
      !tabUrl.includes("sso.acesso.gov.br") &&
      credentials.status !== "fazendo_login"
    ) {
      try {
        await DOMInjector.waitForElement(tabId, "button.br-button.primary", 5000);
        await DOMInjector.clickElement(tabId, "button.br-button.primary");
        await this.updateStatus(tabId, "fazendo_login", "Fazendo Login", "Redirecionando para Gov.BR...");
      } catch (e) {
        console.log("Botao MTE nao encontrado ou ja clicado");
      }
    }

    if (tabUrl.includes("sso.acesso.gov.br/login")) {
      await this.handleGovBrLogin(tabId, credentials);
    }
  }
}

export class INSSStrategy extends BaseAuthStrategy {
  name = "INSS";
  urlTrigger = INSS_HOST;

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      isInssUrl(tabUrl) &&
      !tabUrl.includes("sso.acesso.gov.br") &&
      credentials.status !== "fazendo_login"
    ) {
      try {
        await DOMInjector.waitForElement(tabId, "#main-content", 5000);
        await DOMInjector.clickElement(tabId, "#main-content");
        await this.updateStatus(tabId, "fazendo_login", "Fazendo Login", "Redirecionando para Gov.BR...");
      } catch (e) {
        console.log("Botao INSS nao encontrado ou ja clicado");
      }
    }

    if (tabUrl.includes("sso.acesso.gov.br/login")) {
      await this.handleGovBrLogin(tabId, credentials);
    }
  }
}

export class PesqBrasilMPAStrategy extends BaseAuthStrategy {
  name = "PesqBrasilMPA";
  urlTrigger = PESQBRASIL_MPA_HOST;

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      isPesqBrasilMpaUrl(tabUrl) &&
      !tabUrl.includes("sso.acesso.gov.br") &&
      credentials.status !== "fazendo_login"
    ) {
      try {
        await DOMInjector.waitForElement(tabId, "#button_____r0", 12000);
        // Aguarda framework conectar event handlers antes de clicar
        await new Promise(r => setTimeout(r, 500));
        await DOMInjector.clickElement(tabId, "#button_____r0");
        await this.updateStatus(tabId, "fazendo_login", "Fazendo Login", "Redirecionando para Gov.BR...");
      } catch (e) {
        console.log("Botao PesqBrasil MPA nao encontrado ou ja clicado");
      }
    }

    if (tabUrl.includes("sso.acesso.gov.br/login")) {
      await this.handleGovBrLogin(tabId, credentials);
    }
  }
}

export class ESocialStrategy extends BaseAuthStrategy {
  name = "eSocial";
  urlTrigger = "login.esocial.gov.br";

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (tabUrl.includes(this.urlTrigger)) {
      try {
        await DOMInjector.waitForElement(tabId, ".br-button.sign-in", 5000);
        await DOMInjector.clickElement(tabId, ".br-button.sign-in");
      } catch (e) {}
    }

    if (tabUrl.includes("sso.acesso.gov.br/login")) {
      await this.handleGovBrLogin(tabId, credentials);
    }
  }
}

export class CadUnicoStrategy extends BaseAuthStrategy {
  name = "CadUnico";
  urlTrigger = CADUNICO_HOST;

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      tabUrl.includes(CADUNICO_HOST) &&
      !tabUrl.includes("sso.acesso.gov.br") &&
      credentials.status !== "fazendo_login"
    ) {
      try {
        // Aguarda o botão Gov.br aparecer na página inicial do CadÚnico
        const selector = await DOMInjector.waitForAnyElement(
          tabId,
          ["button.br-button[class*='botaoGovBr']", ".br-button.primary", "button.br-button"],
          12000,
        );
        if (selector) {
          // Aguarda framework conectar event handlers antes de clicar
          await new Promise(r => setTimeout(r, 500));
          await DOMInjector.clickElement(tabId, selector);
          await this.updateStatus(tabId, "fazendo_login", "Fazendo Login", "Redirecionando para Gov.BR...");
        }
      } catch (e) {
        // Botão não encontrado (pode já estar logado ou em outra rota)
      }
    }

    if (tabUrl.includes("sso.acesso.gov.br/login")) {
      await this.handleGovBrLogin(tabId, credentials);
    }
  }
}

export class EcacStrategy extends BaseAuthStrategy {
  name = "EcacCadastro";
  urlTrigger = ECAC_HOST;

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    // Página de login do eCAC — clica no botão Gov.br
    if (
      isEcacAuthUrl(tabUrl) &&
      credentials.status !== "fazendo_login"
    ) {
      try {
        await DOMInjector.waitForElement(tabId, "input[type='image']", 5000);
        // input[type="image"] tem onclick= no mundo principal; scripting.executeScript (mundo isolado)
        // não dispara o handler — delegamos ao content script que já corre no contexto da página.
        await browser.tabs.sendMessage(tabId, { action: "clickEcacGovBrButton" });
        await this.updateStatus(tabId, "fazendo_login", "Fazendo Login", "Redirecionando para Gov.BR...");
      } catch (e) {}
    }

    if (tabUrl.includes("sso.acesso.gov.br/login")) {
      await this.handleGovBrLogin(tabId, credentials);
    }

    // SSO bypass: Gov.br já tinha sessão ativa no container e redirecionou
    // de volta para o eCAC sem passar pela tela de senha
    if (
      isEcacUrl(tabUrl) &&
      !isEcacAuthUrl(tabUrl) &&
      !tabUrl.includes("sso.acesso.gov.br")
    ) {
      await this.markLoginComplete(tabId);
    }
  }
}
