import { UserCredentials } from "../../shared/types";
import { DOMInjector } from "./dom-injector";
import { StorageService } from "./storage";

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

  /**
   * O Gov.br roda hcaptcha invisível antes de transitar CPF→senha.
   * Quando a tab está em background, o hcaptcha não inicializa e a transição
   * trava. Aguardamos o iframe do widget aparecer antes de clicar.
   */
  private async waitForHcaptchaReady(tabId: number, maxWaitMs = 12000): Promise<void> {
    const pollMs = 400;
    const maxAttempts = Math.ceil(maxWaitMs / pollMs);
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const ready = await DOMInjector.execute(
          tabId,
          () => !!document.querySelector('iframe[src*="hcaptcha"]'),
        );
        if (ready) return;
      } catch {
        return; // tab navegou ou erro — prossegue sem esperar
      }
      await new Promise(r => setTimeout(r, pollMs));
    }
    // Timeout — prossegue mesmo assim (captcha pode não ser obrigatório no fluxo)
  }

  protected async handleGovBrLogin(
    tabId: number,
    creds: UserCredentials,
  ): Promise<void> {
    await this.updateStatus(tabId, "fazendo_login", "Fazendo Login", "Preenchendo credenciais no Gov.BR...");

    const storedCreds = (await StorageService.getCredentials(tabId)) || creds;
    const passwordSubmitted = !!storedCreds.govBrPasswordSubmitted;

    const isTwoFactorScreen = await DOMInjector.execute(
      tabId,
      () => !!document.querySelector("#twoFactorForm input[name='otpInput'], #enter-offline-2fa-code"),
    );

    if (isTwoFactorScreen) {
      await this.markTwoFactorPending(tabId);
      return;
    }

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
        // Aguarda hcaptcha inicializar antes de clicar — sem isso a transição
        // CPF→senha trava quando a tab está em background
        await this.waitForHcaptchaReady(tabId);
        await DOMInjector.clickElement(tabId, "#enter-account-id");
        await StorageService.updateCredentials(tabId, {
          govBrCpfSubmitted: true,
        });

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
    await DOMInjector.waitForElement(tabId, "#password", 1200);
    await DOMInjector.setInputValue(tabId, "#password", senha);
    await DOMInjector.clickElement(tabId, "#submit-button");
    await StorageService.updateCredentials(tabId, { govBrPasswordSubmitted: true });

    // Aguarda até 3s para detectar mensagem de senha inválida antes de marcar login completo.
    // Se a tab navegar (login bem-sucedido), DOMInjector lança e saímos do loop.
    for (let i = 0; i < 6; i++) {
      await new Promise(r => setTimeout(r, 500));
      try {
        const state = await DOMInjector.execute(
          tabId,
          () => ({
            hasError: !!document.querySelector(".br-message.warning"),
            twoFactorPending: !!document.querySelector("#twoFactorForm input[name='otpInput'], #enter-offline-2fa-code"),
          }),
        );
        if (state.hasError) throw new Error("govbr_senha_invalida");
        if (state.twoFactorPending) {
          await this.markTwoFactorPending(tabId);
          return;
        }
      } catch (e: any) {
        if (e?.message === "govbr_senha_invalida") throw e;
        break; // tab navegou ou erro de scripting → assume sucesso
      }
    }

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
  urlTrigger = "pesqbrasil-pescadorprofissional.agro.gov.br";

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      tabUrl.includes("pesqbrasil-pescadorprofissional.agro.gov.br") &&
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
  urlTrigger = "meu.inss.gov.br";

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      tabUrl.includes("meu.inss.gov.br") &&
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
  urlTrigger = "pesqbrasil-pescadorprofissional.mpa.gov.br";

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      tabUrl.includes("pesqbrasil-pescadorprofissional.mpa.gov.br") &&
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
  urlTrigger = "cadunico.dataprev.gov.br";

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    if (
      tabUrl.includes("cadunico.dataprev.gov.br") &&
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
  urlTrigger = "cav.receita.fazenda.gov.br";

  async execute(
    tabId: number,
    tabUrl: string,
    credentials: UserCredentials,
  ): Promise<void> {
    // Página de login do eCAC — clica no botão Gov.br
    if (
      tabUrl.includes("cav.receita.fazenda.gov.br") &&
      tabUrl.includes("autenticacao") &&
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
      tabUrl.includes("cav.receita.fazenda.gov.br") &&
      !tabUrl.includes("autenticacao") &&
      !tabUrl.includes("sso.acesso.gov.br")
    ) {
      await this.markLoginComplete(tabId);
    }
  }
}
