import { ESOCIAL_PORTAL_BASE } from "../utils/esocial-constants";

function buildPortalUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ESOCIAL_PORTAL_BASE}${normalizedPath}`;
}

function detectHtmlErrorMessage(html: string): string | null {
  if (!html.includes("alert-danger") && !html.includes("alert-error")) {
    console.debug("[SIGESS] No alert-danger or alert-error found in response");
    return null;
  }

  console.debug("[SIGESS] Alert class found, parsing HTML for error message");
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");

  // Look for error divs
  const errorDiv = doc.querySelector(".alert-danger, .alert-error");
  console.debug("[SIGESS] errorDiv found:", !!errorDiv);

  if (!errorDiv) {
    console.debug("[SIGESS] No error div found, checking for alternatives");
    // Try looking for divs with alert-danger class directly
    const allDivs = Array.from(doc.querySelectorAll("div"));
    const alertDiv = allDivs.find((div) => {
      const classes = div.className || "";
      return classes.includes("alert-danger") || classes.includes("alert-error");
    });

    if (!alertDiv) {
      console.debug("[SIGESS] No alert div found");
      return null;
    }

    const listItems = Array.from(alertDiv.querySelectorAll("li"));
    if (listItems.length > 0) {
      const messages = listItems
        .map((li) => (li.textContent || "").trim())
        .filter((msg) => msg.length > 0);
      console.debug("[SIGESS] Extracted error messages:", messages);
      if (messages.length > 0) {
        return messages.join(" | ");
      }
    }

    const text = (alertDiv.textContent || "").trim();
    console.debug("[SIGESS] Alert text:", text);
    return text.length > 0 ? text : null;
  }

  // Extract error text from list items or direct content
  const listItems = Array.from(errorDiv.querySelectorAll("li"));
  console.debug("[SIGESS] Found list items:", listItems.length);

  if (listItems.length > 0) {
    const messages = listItems
      .map((li) => (li.textContent || "").trim())
      .filter((msg) => msg.length > 0);
    console.debug("[SIGESS] Extracted messages:", messages);
    if (messages.length > 0) {
      return messages.join(" | ");
    }
  }

  // Fallback to direct error div text
  const text = (errorDiv.textContent || "").trim();
  console.debug("[SIGESS] Fallback text:", text);
  return text.length > 0 ? text : null;
}

export async function postJson(
  path: string,
  payload: unknown,
): Promise<string> {
  const url = buildPortalUrl(path);
  const body = JSON.stringify(payload);
  console.debug("[SIGESS] POST", path);
  console.debug("[SIGESS] Payload:", body);

  const response = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: body,
  });

  const text = await response.text();
  console.debug("[SIGESS] Response status:", response.status);
  console.debug("[SIGESS] Response headers:", {
    contentType: response.headers.get("content-type"),
    contentLength: response.headers.get("content-length"),
  });
  console.debug("[SIGESS] Response body:", text.slice(0, 1000));

  if (!response.ok) {
    throw new Error(`Falha ao chamar ${path}: HTTP ${response.status}`);
  }

  console.debug("[SIGESS] Checking for HTML error message in POST response...");
  const htmlErrorMessage = detectHtmlErrorMessage(text);
  console.debug("[SIGESS] detectHtmlErrorMessage result:", htmlErrorMessage);
  if (htmlErrorMessage) {
    console.error("[SIGESS] HTML error detected:", htmlErrorMessage);
    throw new Error(`Erro do eSocial: ${htmlErrorMessage}`);
  }

  return text;
}

export async function getJson<T = unknown>(path: string): Promise<T> {
  const response = await fetch(buildPortalUrl(path), {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Falha ao chamar ${path}: HTTP ${response.status}`);
  }

  return response.json();
}

export async function getText(path: string): Promise<string> {
  const url = buildPortalUrl(path);
  console.debug("[SIGESS] GET", path);

  const response = await fetch(url, {
    method: "GET",
    credentials: "include",
  });

  const text = await response.text();
  console.debug("[SIGESS] Response status:", response.status);
  console.debug("[SIGESS] Response body length:", text.length, "bytes");
  console.debug("[SIGESS] Response body:", text.slice(0, 500));

  if (!response.ok) {
    throw new Error(`Falha ao chamar ${path}: HTTP ${response.status}`);
  }

  console.debug("[SIGESS] Checking for HTML error message in GET response...");
  const htmlErrorMessage = detectHtmlErrorMessage(text);
  console.debug("[SIGESS] detectHtmlErrorMessage result:", htmlErrorMessage);
  if (htmlErrorMessage) {
    console.error("[SIGESS] HTML error detected:", htmlErrorMessage);
    throw new Error(`Erro do eSocial: ${htmlErrorMessage}`);
  }

  return text;
}

export async function getBlob(path: string): Promise<Blob> {
  const response = await fetch(buildPortalUrl(path), {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Falha ao chamar ${path}: HTTP ${response.status}`);
  }

  return response.blob();
}

export function buildEsocialUrl(path: string): string {
  return buildPortalUrl(path);
}
