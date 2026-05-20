import { ESOCIAL_PORTAL_BASE } from "../utils/esocial-constants";

function buildPortalUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${ESOCIAL_PORTAL_BASE}${normalizedPath}`;
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
