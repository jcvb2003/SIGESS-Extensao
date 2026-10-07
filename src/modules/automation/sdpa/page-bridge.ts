(function () {
  const SOURCE = "SIGESS_SDPA_DEFESO_BRIDGE";
  const TARGET = "/apis/sdservices-v2/requerimento/v2/pescador/defesosPorMunicipio/";

  if ((window as any).__sigessSdpaDefesoBridgeInstalled) return;
  (window as any).__sigessSdpaDefesoBridgeInstalled = true;

  let armed = false;
  let lastPayload: unknown = null;

  const isTarget = (url: unknown): boolean => String(url || "").includes(TARGET);

  const publish = (payload: unknown) => {
    window.postMessage({ source: SOURCE, type: "RESPONSE", payload }, window.location.origin);
  };

  const capture = (payload: unknown) => {
    lastPayload = payload;
    if (armed) publish(payload);
  };

  const inspectResponse = (url: string, response: Response): Response => {
    if (!isTarget(url)) return response;
    response.clone().json().then(capture).catch(() => undefined);
    return response;
  };

  const originalFetch = window.fetch.bind(window);
  window.fetch = (...args: Parameters<typeof window.fetch>) => {
    const input = args[0];
    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    return originalFetch(...args).then((response) => inspectResponse(url, response));
  };

  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL, ...rest: any[]) {
    (this as any).__sigessSdpaUrl = String(url);
    return (originalOpen as any).apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (...args: any[]) {
    const xhr = this;
    const url = String((xhr as any).__sigessSdpaUrl || "");
    if (isTarget(url)) {
      xhr.addEventListener("load", () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) capture(JSON.parse(xhr.responseText));
        } catch {
          // Resposta não JSON: não envia nada para a extensão.
        }
      }, { once: true });
    }
    return originalSend.apply(this, args as any);
  };

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== SOURCE) return;
    if (event.data.type === "ARM") {
      armed = true;
      if (lastPayload !== null) publish(lastPayload);
    }
    if (event.data.type === "DISARM") armed = false;
  });
})();
