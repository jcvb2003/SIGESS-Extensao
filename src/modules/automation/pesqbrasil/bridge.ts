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
      const url = String((this as any)._url);
      if (url.includes('/registro/') && (url.includes('/dados-pessoais') || url.includes('visualizar'))) {
        handlePayload(this.responseText, url, "XHR");
      }
    });
    return send.apply(this, arguments as any);
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (...args: any[]) => {
    const response = await originalFetch(...(args as [RequestInfo | URL, RequestInit | undefined]));
    const url = typeof args[0] === 'string' ? args[0] : (args[0] as any).url || String(args[0]);
    const urlStr = String(url);

    if (urlStr.includes('/registro/') && (urlStr.includes('/dados-pessoais') || urlStr.includes('visualizar'))) {
       const clone = response.clone();
       clone.text().then((text: string) => {
         handlePayload(text, urlStr, "Fetch");
       }).catch((_e: any) => {});
    }
    return response;
  };

  function handlePayload(text: string, url: string, source: string) {
    if (!text) return;

    const hasData = text.includes('"defaultValues"') || text.includes('"dadosPessoais"') || text.includes('"codigoRGP"');

    if (hasData) {
      console.log(`SIGESS: Dados detectados em ${url} (${source}). Enviando...`);
      globalThis.postMessage({
        type: 'SIGESS_PESQBRASIL_RAW_DATA',
        payload: text
      }, '*');
    }
  }

  console.log("SIGESS: PesqBrasil Bridge Active (v3.2)");
})();
