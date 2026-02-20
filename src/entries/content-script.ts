console.log("[SIGESS] Content Script active");
window.addEventListener("message", function (event) {
  if (event.source !== window) return;
  if (event.data && event.data.type === "abrirAbaContainer") {
    console.log("SIGESS: Repassando mensagem abrirAbaContainer", event.data);
    const browserAPI =
      typeof browser !== "undefined" ? browser : (window as any).chrome;
    if (browserAPI && browserAPI.runtime) {
      browserAPI.runtime.sendMessage(event.data);
    }
  }
});
