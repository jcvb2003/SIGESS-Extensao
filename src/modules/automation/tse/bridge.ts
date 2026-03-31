(function () {
  const XHR = XMLHttpRequest.prototype;
  const send = XHR.send;
  const open = XHR.open;

  XHR.open = function (_method, url) {
    (this as any)._url = url;
    return (open as any).apply(this, arguments);
  };

  XHR.send = function () {
    this.addEventListener('load', function () {
      const url = (this as any)._url;
      if (url && String(url).includes('/eleitor-servico/services/eleitoral/v3/eleitores/onde-votar')) {
        console.log("SIGESS: Detectada requisição de dados em " + url);
        try {
          const response = JSON.parse(this.responseText);
          console.log("SIGESS: Enviando payload SIGESS_TSE_RAW_DATA para extensão...");
          globalThis.postMessage({
            type: 'SIGESS_TSE_RAW_DATA',
            payload: response
          }, '*');
        } catch (e) {
          console.error("SIGESS: Erro ao capturar XHR TSE", e);
        }
      }
    });
    return (send as any).apply(this, arguments);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: any[]) => {
    const response = await originalFetch(...(args as [RequestInfo | URL, RequestInit | undefined]));
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

    if (String(url).includes('/eleitor-servico/services/eleitoral/v3/eleitores/onde-votar')) {
      const clone = response.clone();
      clone.json().then(data => {
        globalThis.postMessage({
          type: 'SIGESS_TSE_RAW_DATA',
          payload: data
        }, globalThis.location.origin);
      }).catch(e => console.error("SIGESS: Erro ao capturar Fetch TSE", e));
    }
    return response;
  };

  console.log("SIGESS: TSE Bridge Injected");
})();
