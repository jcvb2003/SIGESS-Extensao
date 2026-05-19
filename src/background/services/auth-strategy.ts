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
  async markLoginComplete(tabId: number): Promise<void> {
    await StorageService.updateBatchStatus(
      tabId,
      "processando",
      "Login GOV.BR concluido",
      "As credenciais foram aceitas e a sessao esta retornando para o eSocial.",
      {
        loginConcluido: true,
        progressStep: 1,
        progressTotal: 3,
        govBrCpfSubmitted: false,
        govBrPasswordSubmitted: false,
        lastError: undefined,
      },
    );
  }
  async isLoginComplete(tabId: number): Promise<boolean> {
    const creds = await StorageService.getCredentials(tabId);
    return !!creds?.loginConcluido;
  }
  protected async handleGovBrLogin(
    tabId: number,
    creds: UserCredentials,
  ): Promise<void> {
    const cpfScreenState = await DOMInjector.execute(
      tabId,
      () => {
        const input = document.querySelector("#accountId") as HTMLInputElement | null;
        const button = document.querySelector(
          "#enter-account-id",
        ) as HTMLButtonElement | null;
        const navigationEntry = performance.getEntriesByType?.("navigation")?.[0] as
          | PerformanceNavigationTiming
          | undefined;

        return {
          visible: !!input,
          currentValue: input?.value ?? "",
          buttonBusy: !!button && (button.disabled || button.classList.contains("loading")),
          navigationType: navigationEntry?.type ?? "",
        };
      },
    );
    const passScreenState = await DOMInjector.execute(
      tabId,
      () => {
        const input = document.querySelector("#password") as HTMLInputElement | null;
        const button = document.querySelector(
          "#submit-button",
        ) as HTMLButtonElement | null;
        const navigationEntry = performance.getEntriesByType?.("navigation")?.[0] as
          | PerformanceNavigationTiming
          | undefined;

        return {
          visible: !!input,
          currentValue: input?.value ?? "",
          buttonBusy: !!button && (button.disabled || button.classList.contains("loading")),
          navigationType: navigationEntry?.type ?? "",
        };
      },
    );

    if (cpfScreenState?.visible) {
      const shouldRearmCpf =
        !!creds.govBrCpfSubmitted &&
        cpfScreenState.navigationType === "reload" &&
        !cpfScreenState.buttonBusy;

      if (shouldRearmCpf) {
        await StorageService.updateBatchStatus(
          tabId,
          "processando",
          "Tela de CPF recarregada",
          "A pagina do GOV.BR foi recarregada. A extensao vai preencher e reenviar o CPF novamente.",
          {
            govBrCpfSubmitted: false,
            govBrPasswordSubmitted: false,
            lastError: undefined,
          },
        );
        creds = {
          ...creds,
          govBrCpfSubmitted: false,
          govBrPasswordSubmitted: false,
        };
      }

      if (creds.govBrCpfSubmitted) {
        await StorageService.updateBatchStatus(
          tabId,
          "processando",
          "Aguardando tela de senha",
          "O CPF ja foi enviado ao GOV.BR. A extensao esta aguardando a transicao para a etapa da senha sem reenviar o clique.",
          {
            lastError: undefined,
            progressStep: 1,
            progressTotal: 3,
          },
        );
        return;
      }

      await StorageService.updateBatchStatus(
        tabId,
        "processando",
        "Tela de CPF carregada",
        "O GOV.BR abriu a tela de identificacao e a extensao esta preenchendo o CPF.",
        {
          lastError: undefined,
          progressStep: 1,
          progressTotal: 3,
        },
      );
      await DOMInjector.waitForElement(tabId, "#accountId");
      await DOMInjector.setInputValue(tabId, "#accountId", creds.cpf);
      await DOMInjector.clickElement(tabId, "#enter-account-id");
      await StorageService.updateBatchStatus(
        tabId,
        "processando",
        "CPF enviado ao GOV.BR",
        "O CPF foi enviado e a extensao esta aguardando a abertura da tela de senha.",
        {
          progressStep: 1,
          progressTotal: 3,
          govBrCpfSubmitted: true,
          govBrPasswordSubmitted: false,
          lastError: undefined,
        },
      );
    } else if (passScreenState?.visible) {
      const shouldRearmPassword =
        !!creds.govBrPasswordSubmitted &&
        passScreenState.navigationType === "reload" &&
        !passScreenState.buttonBusy;

      if (shouldRearmPassword) {
        await StorageService.updateBatchStatus(
          tabId,
          "processando",
          "Tela de senha recarregada",
          "A pagina do GOV.BR foi recarregada. A extensao vai preencher e reenviar a senha novamente.",
          {
            govBrPasswordSubmitted: false,
            lastError: undefined,
          },
        );
        creds = {
          ...creds,
          govBrPasswordSubmitted: false,
        };
      }

      if (creds.govBrPasswordSubmitted) {
        await StorageService.updateBatchStatus(
          tabId,
          "processando",
          "Aguardando retorno do GOV.BR",
          "A senha ja foi enviada e a extensao esta aguardando o redirecionamento de volta para o sistema.",
          {
            lastError: undefined,
            progressStep: 1,
            progressTotal: 3,
          },
        );
        return;
      }

      await StorageService.updateBatchStatus(
        tabId,
        "processando",
        "Tela de senha carregada",
        "O GOV.BR solicitou a senha e a extensao esta enviando as credenciais do socio.",
        {
          progressStep: 1,
          progressTotal: 3,
          govBrCpfSubmitted: true,
          lastError: undefined,
        },
      );
      await DOMInjector.waitForElement(tabId, "#password");
      await DOMInjector.setInputValue(tabId, "#password", creds.senha);
      await DOMInjector.clickElement(tabId, "#submit-button");
      await StorageService.updateBatchStatus(
        tabId,
        "processando",
        "Senha enviada ao GOV.BR",
        "A senha foi enviada e a extensao esta aguardando a validacao final do login.",
        {
          progressStep: 1,
          progressTotal: 3,
          govBrCpfSubmitted: true,
          govBrPasswordSubmitted: true,
          lastError: undefined,
        },
      );
      await this.markLoginComplete(tabId);
    } else {
      await StorageService.updateBatchStatus(
        tabId,
        "aguardando_pagina",
        "Aguardando tela valida do GOV.BR",
        "A aba abriu, mas o formulario esperado do GOV.BR ainda nao ficou disponivel.",
        {
          lastError: undefined,
          progressStep: 1,
          progressTotal: 3,
        },
      );
    }
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
    await StorageService.updateBatchStatus(
      tabId,
      "aguardando_pagina",
      "Aguardando pagina do PesqBrasil",
      "A sessao foi aberta e a extensao esta aguardando a pagina inicial do PesqBrasil responder.",
      { lastError: undefined },
    );

    if (
      tabUrl.includes("pesqbrasil-pescadorprofissional.agro.gov.br") &&
      !tabUrl.includes("sso.acesso.gov.br")
    ) {
      try {
        await StorageService.updateBatchStatus(
          tabId,
          "processando",
          "Pagina inicial do PesqBrasil carregada",
          "O botao de acesso ao GOV.BR foi encontrado e esta sendo acionado.",
        );
        await DOMInjector.waitForElement(tabId, "#button_____3", 5000);
        await DOMInjector.clickElement(tabId, "#button_____3");
      } catch (e) {
        console.log("Botão PesqBrasil não encontrado ou já clicado");
      }
    }
    if (tabUrl.includes("sso.acesso.gov.br/login")) {
      await StorageService.updateBatchStatus(
        tabId,
        "processando",
        "Redirecionado para o GOV.BR",
        "O PesqBrasil encaminhou a sessao para autenticacao no GOV.BR.",
      );
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
    await StorageService.updateBatchStatus(
      tabId,
      "aguardando_pagina",
      "Aguardando pagina de login do eSocial",
      "A sessao foi aberta e a extensao esta aguardando a tela inicial do eSocial carregar.",
      { lastError: undefined },
    );

    if (tabUrl.includes(this.urlTrigger)) {
      try {
        await StorageService.updateBatchStatus(
          tabId,
          "processando",
          "Pagina inicial do eSocial carregada",
          "O botao Entrar com GOV.BR foi encontrado e esta sendo acionado.",
        );
        await DOMInjector.waitForElement(tabId, ".br-button.sign-in", 5000);
        await DOMInjector.clickElement(tabId, ".br-button.sign-in");
      } catch (e) {}
    }
    if (tabUrl.includes("sso.acesso.gov.br/login")) {
      await StorageService.updateBatchStatus(
        tabId,
        "processando",
        "Redirecionado para o GOV.BR",
        "O eSocial encaminhou a sessao para autenticacao no GOV.BR.",
      );
      await this.handleGovBrLogin(tabId, credentials);
    }
  }
}
