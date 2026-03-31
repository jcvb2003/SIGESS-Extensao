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
      if (url && String(url).includes('/registro/') && String(url).includes('/dados-pessoais')) {
        console.log("SIGESS: Detectada requisição de dados em " + url);
        handlePayload(this.responseText);
      }
    });
    return send.apply(this, arguments as any);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => {
    const response = await originalFetch(...(args as [RequestInfo | URL, RequestInit | undefined]));
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as Request).url;

    if (String(url).includes('/registro/') && String(url).includes('/dados-pessoais')) {
      const clone = response.clone();
      clone.text().then(text => {
        handlePayload(text);
      }).catch(e => console.error("SIGESS: Erro ao ler fetch PesqBrasil", e));
    }
    return response;
  };

  function handlePayload(text: string) {
    if (text && text.includes('defaultValues')) {
      try {
        const payload = JSON.parse(text);
        console.log("SIGESS: Enviando payload SIGESS_PESQBRASIL_RAW_DATA para extensão...");
        globalThis.postMessage({
          type: 'SIGESS_PESQBRASIL_RAW_DATA',
          payload: payload
        }, '*');
      } catch (e) {
        console.error("SIGESS: Erro ao processar payload JSON", e);
      }
    }
  }

  console.log("SIGESS: PesqBrasil Bridge Injected");
})();
