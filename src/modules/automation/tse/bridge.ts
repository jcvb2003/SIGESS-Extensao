(function () {
  const XHR = XMLHttpRequest.prototype;
  const send = XHR.send;
  const open = XHR.open;

  XHR.open = function (this: XMLHttpRequest, _method: string, url: string | URL) {
    (this as any)._url = url;
    return open.apply(this, arguments as any);
  };

  XHR.send = function (this: XMLHttpRequest) {
    this.addEventListener('load', function () {
      const url = (this as any)._url;
      if (url && String(url).includes('/eleitores/onde-votar')) {
        console.log("SIGESS: Detectada resposta TSE Onde Votar (API v3)");
        try {
          const data = JSON.parse(this.responseText);
          if (data) {
             globalThis.postMessage({
              type: 'SIGESS_TSE_RAW_DATA',
              payload: data
            }, '*');
          }
        } catch (e) {
          console.error("SIGESS: Erro ao parsear resposta TSE", e);
        }
      }
    });
    return send.apply(this, arguments as any);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...(args as [RequestInfo | URL, RequestInit | undefined]));
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

    if (String(url).includes('/eleitores/onde-votar')) {
      const clone = response.clone();
      clone.json().then(data => {
        globalThis.postMessage({
          type: 'SIGESS_TSE_RAW_DATA',
          payload: data
        }, '*');
      }).catch(e => console.error("SIGESS: Erro ao ler fetch TSE", e));
    }
    return response;
  };

  console.log("SIGESS: TSE Bridge Injected");
})();
