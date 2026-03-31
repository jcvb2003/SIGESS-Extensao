(function () {
  let capturedBearer = '';
  let capturedXSRF = '';
  let capturedCnas = '';
  let capturedCpf = '';

  const CPF_REGEX = /\/pessoa\/(\d{11})\/tipos-perfil/;

  function checkAndSendTokens() {
    if (capturedBearer && capturedXSRF && capturedCpf) {
      console.log("SIGESS: Todos os tokens do CadÚnico capturados! Enviando para extensão...");
      globalThis.postMessage({
        type: 'SIGESS_CADUNICO_ADV_TOKENS',
        payload: {
          bearer: capturedBearer,
          xsrf: capturedXSRF,
          cnas: capturedCnas || '1.35.00',
          cpf: capturedCpf
        }
      }, '*');
    }
  }

  // Interceptação de Headers em Fetch
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async function(resource: any, init?: any) {
    const url = typeof resource === 'string' ? resource : (resource?.url || '');

    if (url && typeof url === 'string' && CPF_REGEX.test(url)) {
      const match = url.match(CPF_REGEX);
      if (match?.[1]) {
        capturedCpf = match[1];
        console.log("SIGESS: CPF capturado via Fetch: " + capturedCpf);
      }
    }

    if (init?.headers) {
      const headers = init.headers as any;
      if (headers['Authorization']) capturedBearer = headers['Authorization'];
      if (headers['X-XSRF-TOKEN']) capturedXSRF = headers['X-XSRF-TOKEN'];
      if (headers['CnasVersao']) capturedCnas = headers['CnasVersao'];
      checkAndSendTokens();
    }

    return originalFetch.call(this, resource, init);
  };

  // Interceptação de Headers em XHR
  const XHR = XMLHttpRequest.prototype;
  const setRequestHeader = XHR.setRequestHeader;
  const open = XHR.open;

  XHR.open = function (this: any, _method: string, url: string | URL) {
    this._url = url;
    const urlStr = typeof url === 'string' ? url : url.toString();
    if (urlStr && CPF_REGEX.test(urlStr)) {
      const match = urlStr.match(CPF_REGEX);
      if (match?.[1]) {
        capturedCpf = match[1];
        console.log("SIGESS: CPF capturado via XHR: " + capturedCpf);
      }
    }
    return (open as any).apply(this, arguments);
  };

  XHR.setRequestHeader = function (this: any, _header: string, _value: string) {
    if (_header.toLowerCase() === 'authorization') capturedBearer = _value;
    if (_header.toLowerCase() === 'x-xsrf-token') capturedXSRF = _value;
    if (_header.toLowerCase() === 'cnasversao') capturedCnas = _value;
    
    if (capturedBearer && capturedXSRF) checkAndSendTokens();

    return (setRequestHeader as any).apply(this, arguments);
  };

  console.log("SIGESS: CadÚnico Advanced Bridge Injected");
})();
