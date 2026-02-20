console.log("SINPESCA: Content Script active");

// Listener para ponte Webpage -> Extension (Ex: sinpesca.vercel.app)
window.addEventListener("message", function (event) {
    if (event.source !== window) return;

    if (event.data && event.data.type === "abrirAbaContainer") {
        console.log("SINPESCA: Repassando mensagem abrirAbaContainer", event.data);

        // @ts-ignore
        const browserAPI = typeof browser !== 'undefined' ? browser : chrome;
        browserAPI.runtime.sendMessage(event.data);
    }
});
