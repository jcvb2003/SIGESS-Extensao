import { getUpdateAvailableInfo } from "../shared/services/update-block";

console.log("[SIGESS] Content Script active");

const ALLOWED_MESSAGE_TYPES = new Set([
  "checkExtensionAvailability",
  "enqueueGovBatchSessions",
  "startGovBatchGeneration",
  "startGovBatchConsultation",
  "getGovBatchStatuses",
  "getESocialAutomationSettings",
  "getAutoRegistrationSnapshot",
  "abrirAbaContainer",
  "updateESocialSettings",
  "updateSettings",
  "iniciarCadastroAutomatico",
  "cancelarCadastroAutomatico",
  "dispensarCadunicoEEncerrar",
  "limparDadosCapturados",
  "abrirDataInspector",
  "openSidebar",
  "clearGovBatchHistory",
  "startMpaConsultationBatch",
  "cancelMpaConsultationBatch",
]);

const UPDATE_ALLOWED_MESSAGE_TYPES = new Set([
  "getGovBatchStatuses",
  "getESocialAutomationSettings",
  "getAutoRegistrationSnapshot",
  "updateESocialSettings",
  "updateSettings",
]);
const UPDATE_STATUS_READ_MESSAGE_TYPES = new Set([
  "getGovBatchStatuses",
  "getESocialAutomationSettings",
  "getAutoRegistrationSnapshot",
]);
const EXTENSION_EVENT_TYPE = "SIGESS_EXTENSION_EVENT";
const ESOCIAL_SETTINGS_EVENT_NAME = "esocialAutomationSettingsChanged";
const EXTENSION_BRIDGE_STATUS_EVENT_NAME = "extensionBridgeStateChanged";

type ESocialAutomationSettingsSnapshot = {
  competencia: string;
  gerarGps: boolean;
  consultarGuias: boolean;
  selectedYear: string;
  selectedMonth: string;
};

function isTrustedWebOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    if (
      url.origin === "https://app.sigess.com.br" ||
      url.origin === "https://dev.sigess.com.br"
    ) return true;
    return url.protocol === "http:"
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function buildESocialAutomationSnapshot(settings: Record<string, unknown>): ESocialAutomationSettingsSnapshot {
  const rawYear = String(settings.selectedYear || "").trim();
  const month = String(settings.selectedMonth || "").padStart(2, "0");
  const year = rawYear === "current" ? String(new Date().getFullYear()) : rawYear;
  const competencia =
    year && month && /^\d{4}$/.test(year) && /^\d{2}$/.test(month)
      ? `${year}-${month}`
      : "";

  return {
    competencia,
    gerarGps: Boolean(settings.gerarGps),
    consultarGuias: Boolean(settings.consultarGuias),
    selectedYear: rawYear || "current",
    selectedMonth: month,
  };
}

function emitESocialAutomationSettingsChanged(settings: Record<string, unknown>) {
  window.postMessage(
    {
      type: EXTENSION_EVENT_TYPE,
      eventName: ESOCIAL_SETTINGS_EVENT_NAME,
      data: buildESocialAutomationSnapshot(settings),
    },
    window.location.origin,
  );
}

window.addEventListener("message", function (event) {
  if (event.source !== window) return;

  const messageType = event.data?.type;
  if (!ALLOWED_MESSAGE_TYPES.has(messageType)) return;
  if (messageType === "abrirAbaContainer" && !isTrustedWebOrigin(event.origin)) return;

  console.log("[SIGESS] Content Script: Repassando mensagem para background", {
    type: messageType,
    requestId: event.data.requestId,
  });

  const browserAPI =
    typeof browser !== "undefined" ? browser : (window as any).chrome;

  if (!browserAPI?.runtime?.sendMessage) {
    console.error("[SIGESS] browser.runtime.sendMessage não disponível");
    return;
  }

  void getUpdateAvailableInfo().then((updateInfo) => {
    if (updateInfo && !UPDATE_ALLOWED_MESSAGE_TYPES.has(messageType)) {
      if (event.data.requestId) {
        window.postMessage(
          {
            type: "SIGESS_EXTENSION_RESPONSE",
            requestId: event.data.requestId,
            response: {
              success: false,
              state: "update_required",
              error: "Nova versão detectada. Atualize a extensão para continuar.",
              updateAvailable: updateInfo,
            },
          },
          window.location.origin,
        );
      }
      return;
    }

    browserAPI.runtime
      .sendMessage(event.data)
      .then((response: unknown) => {
        console.log("[SIGESS] Content Script: Resposta recebida do background", {
          originalType: messageType,
          requestId: event.data.requestId,
          response,
        });

        if (event.data.requestId) {
          console.log("[SIGESS] Content Script: Enviando SIGESS_EXTENSION_RESPONSE de volta ao Web", {
            requestId: event.data.requestId,
          });

          window.postMessage(
            {
              type: "SIGESS_EXTENSION_RESPONSE",
              requestId: event.data.requestId,
              response: updateInfo && UPDATE_STATUS_READ_MESSAGE_TYPES.has(messageType)
                ? {
                    ...(response && typeof response === "object" ? response : { success: false, error: "Sem resposta do background" }),
                    state: "update_required",
                    updateAvailable: updateInfo,
                  }
                : response || { success: false, error: "Sem resposta do background" },
            },
            window.location.origin,
          );
        }
      })
      .catch((error: unknown) => {
        console.error("[SIGESS] Content Script: Erro ao enviar para background", error);

        if (event.data.requestId) {
          window.postMessage(
            {
              type: "SIGESS_EXTENSION_RESPONSE",
              requestId: event.data.requestId,
              response: {
                success: false,
                state: "bridge_unavailable",
                error:
                  error instanceof Error
                    ? error.message
                    : "Erro ao comunicar com a extensão",
              },
            },
            window.location.origin,
          );
        }
      });
  });
});

const browserAPI =
  typeof browser !== "undefined" ? browser : (window as any).chrome;

if (browserAPI?.storage?.onChanged) {
  browserAPI.storage.onChanged.addListener((changes: Record<string, { newValue?: unknown }>, areaName: string) => {
    if (areaName !== "local") return;

    if ("updateAvailable" in changes) {
      const updateAvailable = changes.updateAvailable?.newValue as {
        version?: string;
        url?: string;
      } | undefined;
      const hasUpdateAvailable = updateAvailable !== undefined && updateAvailable !== null;

      window.postMessage(
        {
          type: EXTENSION_EVENT_TYPE,
          eventName: EXTENSION_BRIDGE_STATUS_EVENT_NAME,
          data: hasUpdateAvailable
            ? { state: "update_required", updateAvailable }
            : { state: "bridge_ready" },
        },
        window.location.origin,
      );
    }

    if (changes.sigessSettings?.newValue) {
      emitESocialAutomationSettingsChanged(changes.sigessSettings.newValue as Record<string, unknown>);
    }

    if ("sigessActiveCadastro" in changes) {
      const newSession = changes.sigessActiveCadastro?.newValue as Record<string, unknown> | undefined;
      window.postMessage(
        {
          type: EXTENSION_EVENT_TYPE,
          eventName: "cadastroAutomaticoAtualizado",
          data: newSession ?? null,
        },
        window.location.origin,
      );
    }

    if (changes.sigessSettings?.newValue && "pessoaData_raw" in (changes.sigessSettings.newValue as Record<string, unknown>)) {
      window.postMessage(
        { type: EXTENSION_EVENT_TYPE, eventName: "pessoaDataAtualizada" },
        window.location.origin,
      );
    }
  });
}

if (browserAPI?.runtime?.onMessage) {
  browserAPI.runtime.onMessage.addListener((msg: any) => {
    if (msg?.type === EXTENSION_EVENT_TYPE) {
      window.postMessage(msg, window.location.origin);
    }
  });
}
