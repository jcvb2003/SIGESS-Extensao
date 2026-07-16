(function () {
  if ((globalThis as any).__sigessInssBridgeLoaded) return;
  (globalThis as any).__sigessInssBridgeLoaded = true;

  const DATA_ENDPOINT = "/extratocnisservices/dadoscompletos/";

  function emit(payload: unknown): void {
    globalThis.postMessage({
      type: "SIGESS_INSS_RAW_DATA",
      payload,
    }, globalThis.location.origin);
  }

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: any[]) => {
    const response = await originalFetch(...(args as [RequestInfo | URL, RequestInit | undefined]));
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request).url;
    if (String(url).includes(DATA_ENDPOINT) && response.ok) {
      response.clone().json().then(emit).catch(() => {});
    }
    return response;
  };

  const XHR = XMLHttpRequest.prototype;
  const originalOpen = XHR.open;
  const originalSend = XHR.send;
  XHR.open = function (this: XMLHttpRequest, _method: string, url: string | URL) {
    (this as XMLHttpRequest & { __sigessUrl?: string }).__sigessUrl = String(url);
    return originalOpen.apply(this, arguments as any);
  };
  XHR.send = function (this: XMLHttpRequest) {
    this.addEventListener("load", () => {
      const url = (this as XMLHttpRequest & { __sigessUrl?: string }).__sigessUrl || "";
      if (!url.includes(DATA_ENDPOINT) || this.status !== 200) return;
      try {
        emit(JSON.parse(this.responseText));
      } catch {
        // A resposta pode não ser JSON mesmo com status 200; não gera conclusão falsa.
      }
    });
    return originalSend.apply(this, arguments as any);
  };
})();
