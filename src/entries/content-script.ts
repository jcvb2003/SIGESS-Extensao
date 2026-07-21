import { getUpdateAvailableInfo } from "../shared/services/update-block";

console.log("[SIGESS] Content Script active");

const ALLOWED_MESSAGE_TYPES = new Set([
  "enqueueGovBatchSessions",
  "getGovBatchStatuses",
  "getESocialAutomationSettings",
  "getAutoRegistrationSnapshot",
  "abrirAbaContainer",
  "updateESocialSettings",
  "updateSettings",
  "iniciarCadastroAutomatico",
  "cancelarCadastroAutomatico",
  "usarInssComoAlternativa",
  "limparDadosCapturados",
  "abrirDataInspector",
]);

const UPDATE_ALLOWED_MESSAGE_TYPES = new Set([
  "getGovBatchStatuses",
  "getESocialAutomationSettings",
  "getAutoRegistrationSnapshot",
  "updateESocialSettings",
  "updateSettings",
]);
const EXTENSION_EVENT_TYPE = "SIGESS_EXTENSION_EVENT";
const ESOCIAL_SETTINGS_EVENT_NAME = "esocialAutomationSettingsChanged";

type ESocialAutomationSettingsSnapshot = {
  competencia: string;
  gerarGps: boolean;
  consultarGuias: boolean;
  selectedYear: string;
  selectedMonth: string;
};

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
              error: "Nova versão detectada. Atualize a extensão para continuar.",
              updateRequired: true,
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
              response: response || { success: false, error: "Sem resposta do background" },
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
