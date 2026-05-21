console.log("[SIGESS] Content Script active");

const ALLOWED_MESSAGE_TYPES = new Set([
  "enqueueGovBatchSessions",
  "getGovBatchStatuses",
  "getESocialAutomationSettings",
  "getAutoRegistrationSnapshot",
  "abrirAbaContainer",
]);

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
