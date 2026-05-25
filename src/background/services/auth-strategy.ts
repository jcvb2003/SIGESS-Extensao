import { UserCredentials } from "../../shared/types";
import { DOMInjector } from "./dom-injector";
import { StorageService } from "./storage";

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
    const cpfSubmitted = !!storedCreds.govBrCpfSubmitted;
    const passwordSubmitted = !!storedCreds.govBrPasswordSubmitted;

    const isCpfScreen = await DOMInjector.execute(
      tabId,
      () => !!document.querySelector("#accountId"),
    );
    const isPassScreen = await DOMInjector.execute(
      tabId,
      () => !!document.querySelector("#password"),
    );

    if (isCpfScreen) {
      try {
        await DOMInjector.waitForElement(tabId, "#accountId", 2500);

        if (!cpfSubmitted) {
          await DOMInjector.setInputValue(tabId, "#accountId", creds.cpf);
          await DOMInjector.clickElement(tabId, "#enter-account-id");
          await StorageService.updateCredentials(tabId, {
            govBrCpfSubmitted: true,
            govBrPasswordSubmitted: false,
          });
        }

        const nextElement = await DOMInjector.waitForAnyElement(
          tabId,
          ["#password", "#accountId"],
          8000,
        );

        if (nextElement === "#password") {
          await this.submitGovBrPassword(tabId, creds.senha);
        }
      } catch (e) {
        console.log(`[Auth] Erro ao preencher CPF:`, e);
        throw e;
      }
    } else if (isPassScreen) {
      try {
        if (!passwordSubmitted) {
          await this.submitGovBrPassword(tabId, creds.senha);
        } else {
          await this.markLoginComplete(tabId);
        }
      } catch (e) {
        console.log(`[Auth] Erro ao preencher senha:`, e);
        throw e;
      }
    }
  }

  private async submitGovBrPassword(tabId: number, senha: string): Promise<void> {
    await DOMInjector.waitForElement(tabId, "#password", 1200);
    await DOMInjector.setInputValue(tabId, "#password", senha);
    await DOMInjector.clickElement(tabId, "#submit-button");
    await StorageService.updateCredentials(tabId, {
      govBrPasswordSubmitted: true,
    });
    await this.markLoginComplete(tabId);
  }
}

export class PesqBrasilStrategy extends BaseAuthStrategy {
  name = "PesqBrasil";
  urlTrigger = "pesqbrasil-pescadorprofissional.agro.gov.br";

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      tabUrl.includes("pesqbrasil-pescadorprofissional.agro.gov.br") &&
      !tabUrl.includes("sso.acesso.gov.br")
    ) {
      try {
        await DOMInjector.waitForElement(tabId, "#button_____3", 5000);
        await DOMInjector.clickElement(tabId, "#button_____3");
      } catch (e) {
        console.log("Botao PesqBrasil nao encontrado ou ja clicado");
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
