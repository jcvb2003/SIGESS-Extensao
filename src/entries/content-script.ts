console.log("[SIGESS] Content Script active");
window.addEventListener("message", function (event) {
  if (event.source !== window) return;

  const messageType = event.data?.type;

  // Only process expected message types
  if (messageType !== "enqueueGovBatchSessions" &&
      messageType !== "getGovBatchStatuses" &&
      messageType !== "abrirAbaContainer") {
    return;
  }

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

  // Envia para background e aguarda resposta
  browserAPI.runtime
    .sendMessage(event.data)
    .then((response: unknown) => {
      console.log("[SIGESS] Content Script: Resposta recebida do background", {
        type: messageType,
        requestId: event.data.requestId,
        hasResponse: !!response,
      });

      // Retorna resposta para a página Web
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
