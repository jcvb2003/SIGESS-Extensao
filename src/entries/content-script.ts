console.log("[SIGESS] Content Script active");
window.addEventListener("message", function (event) {
  if (event.source !== window) return;
  if (
    event.data &&
    (event.data.type === "abrirAbaContainer" ||
      event.data.type === "enqueueGovBatchSessions" ||
      event.data.type === "getGovBatchStatuses")
  ) {
    console.log("SIGESS: Repassando mensagem para extensao", event.data);
    const browserAPI =
      typeof browser !== "undefined" ? browser : (window as any).chrome;
    if (browserAPI && browserAPI.runtime) {
      browserAPI.runtime
        .sendMessage(event.data)
        .then((response: unknown) => {
          if (
            (event.data.type === "enqueueGovBatchSessions" ||
              event.data.type === "getGovBatchStatuses") &&
            event.data.requestId
          ) {
            console.log("SIGESS: Enviando resposta de volta", {
              requestId: event.data.requestId,
              response,
            });
            window.postMessage(
              {
                type: "SIGESS_EXTENSION_RESPONSE",
                requestId: event.data.requestId,
                response,
              },
              window.location.origin,
            );
          } else if (event.data.type === "abrirAbaContainer") {
            console.log("SIGESS: abrirAbaContainer completado", response);
          }
        })
        .catch((error: unknown) => {
          console.error("SIGESS: Erro ao comunicar com background", error);
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
    }
  }
});
