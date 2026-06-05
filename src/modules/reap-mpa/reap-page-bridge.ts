(function () {
  // Bridge de diagnóstico — inativo por padrão.
  // Para ativar: window.__SIGESS_DIAGNOSTICS = true (antes da injeção deste script)
  if (!(window as any).__SIGESS_DIAGNOSTICS) return;

  if ((window as any).__sigessReapPageHooksInstalled) return;
  (window as any).__sigessReapPageHooksInstalled = true;

  const logFormData = (fd: FormData) => {
    console.log("%c--- FormData fields ---", "color: #a78bfa; font-weight: bold;");
    for (const [key, val] of (fd as FormData).entries()) {
      if (val instanceof File) {
        console.log(`  [File] ${key}: name="${val.name}" size=${val.size} type="${val.type}"`);
      } else {
        const str = String(val);
        console.log(`  [Field] ${key}: "${str.length > 300 ? str.substring(0, 300) + '…' : str}"`);
      }
    }
    console.log("%c-----------------------", "color: #a78bfa;");
  };

  const emit = (payload: Record<string, unknown>, rawBody?: any) => {
    console.log("%c=== [SIGESS DIAG] PAGE POST CAPTURED ===", "color: #a78bfa; font-weight: bold;");
    console.log("Transport:", payload.transport, "| URL:", payload.url);
    console.log("Headers:", JSON.stringify(payload.headers ?? {}, null, 2));
    if (rawBody instanceof FormData) {
      logFormData(rawBody);
    } else if (typeof payload.body === "string") {
      try {
        console.log("Body JSON:", JSON.stringify(JSON.parse(payload.body), null, 2));
      } catch {
        console.log("Body Raw:", payload.body);
      }
    } else {
      console.log("Body Raw:", payload.body);
    }
    window.postMessage({ type: "SIGESS_REAP_PAGE_POST_CAPTURED", payload }, window.location.origin);
  };

  const originalFetch = window.fetch;
  window.fetch = async (...args) => {
    const [input, init = {}] = args as [RequestInfo | URL, RequestInit?];
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as Request).url || String(input);
    const method = String(init?.method || "GET").toUpperCase();

    if (method === "POST" && url.includes("informe-mensal")) {
      const rawBody = init?.body;
      emit({
        transport: "fetch",
        url,
        headers: init?.headers || {},
        body: typeof rawBody === "string" ? rawBody : null,
      }, rawBody instanceof FormData ? rawBody : undefined);
    }

    return originalFetch.apply(window, args);
  };

  const xhrOpen = XMLHttpRequest.prototype.open;
  const xhrSend = XMLHttpRequest.prototype.send;
  const xhrSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method: string, url: string | URL) {
    (this as any).__sigessMethod = method;
    (this as any).__sigessUrl = url;
    (this as any).__sigessHeaders = {};
    return xhrOpen.apply(this, arguments as any);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (name: string, value: string) {
    (this as any).__sigessHeaders = (this as any).__sigessHeaders || {};
    (this as any).__sigessHeaders[name] = value;
    return xhrSetRequestHeader.apply(this, arguments as any);
  };

  XMLHttpRequest.prototype.send = function (body?: Document | XMLHttpRequestBodyInit | null) {
    const method = String((this as any).__sigessMethod || "GET").toUpperCase();
    const url = String((this as any).__sigessUrl || "");

    if (method === "POST" && url.includes("informe-mensal")) {
      emit({
        transport: "xhr",
        url,
        headers: (this as any).__sigessHeaders || {},
        body: typeof body === "string" ? body : null,
      }, body instanceof FormData ? body : undefined);
    }

    return xhrSend.apply(this, arguments as any);
  };

  console.log("%c[SIGESS DIAG] REAP Page Bridge ativo", "color: #a78bfa; font-weight: bold;");
})();
