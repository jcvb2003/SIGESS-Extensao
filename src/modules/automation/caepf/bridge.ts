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
      if (url && String(url).includes('/caepf-main/api/v1/aepfs/pesquisa')) {
        console.log("SIGESS: Detectada requisição de dados em " + url);
        try {
          const response = JSON.parse(this.responseText);
          console.log("SIGESS: Enviando payload SIGESS_CAEPF_RAW_DATA para extensão...");
          globalThis.postMessage({
            type: 'SIGESS_CAEPF_RAW_DATA',
            payload: response
          }, '*');
        } catch (e) {
          console.error("SIGESS: Erro ao capturar XHR CAEPF", e);
        }
      }
    });
    return (send as any).apply(this, arguments);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: any[]) => {
    const response = await originalFetch(...(args as [RequestInfo | URL, RequestInit | undefined]));
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

    if (String(url).includes('/caepf-main/api/v1/aepfs/pesquisa')) {
      const clone = response.clone();
      clone.json().then(data => {
        console.log("SIGESS: Enviando payload SIGESS_CAEPF_RAW_DATA para extensão (Fetch)...");
        globalThis.postMessage({
          type: 'SIGESS_CAEPF_RAW_DATA',
          payload: data
        }, '*');
      }).catch(e => console.error("SIGESS: Erro ao capturar Fetch CAEPF", e));
    }
    return response;
  };

  console.log("SIGESS: CAEPF Bridge Injected");
})();
