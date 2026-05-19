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
  const response = await fetch(buildPortalUrl(path), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "X-Requested-With": "XMLHttpRequest",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Falha ao chamar ${path}: HTTP ${response.status}`);
  }

  return response.text();
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
  const response = await fetch(buildPortalUrl(path), {
    method: "GET",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Falha ao chamar ${path}: HTTP ${response.status}`);
  }

  return response.text();
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
