import { COMPETENCIA_REGEX, MONEY_VALUE_REGEX } from "./esocial-constants";
import { extractCleanName } from "./file-naming";

type SessionData = {
  Nome?: string;
  NI?: string;
  IDSessao?: string;
} | null;

export function extractCompetenciaFromUrl(url: string | null): string | null {
  if (!url) return null;

  try {
    const parsed = new URL(url, window.location.origin);
    const competencia = parsed.searchParams.get("competencia");
    return competencia && /^\d{6}$/.test(competencia) ? competencia : null;
  } catch {
    const match = COMPETENCIA_REGEX.exec(url);
    return match?.[1] || null;
  }
}

export function extractCompetenciaFromDom(): string | null {
  const candidates = [
    (document.querySelector("#Competencia") as HTMLInputElement | null)?.value,
    (document.querySelector("#hiddenCompetencia") as HTMLInputElement | null)?.value,
    (document.querySelector("#PeriodoApuracao") as HTMLInputElement | null)?.value?.replace(
      "-",
      "",
    ),
  ];

  for (const candidate of candidates) {
    if (candidate && /^\d{6}$/.test(candidate)) return candidate;
  }

  return null;
}

export function extractMoneyValues(text: string): number[] {
  const matches = text.match(MONEY_VALUE_REGEX) || [];
  return matches
    .map((value) => Number(value.replace(/\./g, "").replace(",", ".")))
    .filter((value) => Number.isFinite(value));
}

export async function getStoredCredentials(): Promise<{ cpf: string; nome: string }> {
  const browserAPI = typeof browser !== "undefined" ? browser : (window as any).chrome;
  const creds = await browserAPI.storage.local.get(null);
  const credKey = Object.keys(creds).find((key) => key.startsWith("credenciais_"));
  const cred = credKey ? creds[credKey] : creds.sigess_last_esocial_credentials;

  return {
    cpf: String(cred?.cpf || "SEM_CPF").replace(/\D/g, ""),
    nome: String(cred?.nome || "SEM_NOME"),
  };
}

export async function getBestCpf(): Promise<string> {
  // Try to get CPF from eSocial session API first (most reliable)
  const sessionCpf = await getBestCpfFromSession();
  if (sessionCpf && sessionCpf !== "SEMCPF" && sessionCpf !== "SEM_CPF") {
    return sessionCpf;
  }

  // Fallback to stored credentials
  const { cpf: fromStorage } = await getStoredCredentials();
  if (fromStorage && fromStorage !== "SEMCPF" && fromStorage !== "SEM_CPF") {
    return fromStorage;
  }

  // Fallback to global variable
  const globalCpf = String((window as { identidadeLocal?: unknown }).identidadeLocal || "")
    .replace(/\D/g, "");
  if (globalCpf) return globalCpf;

  return "SEM_CPF";
}

async function fetchEsocialSessionData(): Promise<SessionData> {
  try {
    const response = await fetch(
      "https://login.esocial.gov.br/api/v1/LoginESocialConsultas.svc/DadosSessao?callback=getSessao&_=" + Date.now(),
      {
        method: "GET",
        credentials: "include",
      }
    );

    if (!response.ok) return null;

    const text = await response.text();
    // Extract JSON from JSONP callback: getSessao({...})
    const jsonMatch = text.match(/getSessao\((.*)\);?$/);
    if (!jsonMatch || !jsonMatch[1]) return null;

    const data = JSON.parse(jsonMatch[1]) as SessionData;
    return data;
  } catch (error) {
    console.debug("[SIGESS] Falha ao buscar dados de sessão eSocial:", error);
    return null;
  }
}

export async function getBestNome(): Promise<string> {
  // Try to get nome from eSocial session API first (most reliable)
  const sessionData = await fetchEsocialSessionData();
  if (sessionData?.Nome) {
    return extractCleanName(sessionData.Nome) || "SEM_NOME";
  }

  // Fallback to global variable
  const globalNome = extractCleanName(
    String((window as { nomeUsuario?: unknown }).nomeUsuario || "").trim(),
  );
  if (globalNome) return globalNome;

  // Fallback to stored credentials
  const { nome: fromStorage } = await getStoredCredentials();
  const fromStorageClean = extractCleanName(fromStorage);
  if (fromStorageClean) return fromStorageClean;

  // Fallback to DOM
  const domNome =
    extractCleanName(document.querySelector(".nome-usuario")?.textContent?.trim() || "") ||
    document.querySelector("#header")?.textContent?.trim() ||
    "";

  return extractCleanName(domNome) || "SEM_NOME";
}

export async function getBestCpfFromSession(): Promise<string> {
  const sessionData = await fetchEsocialSessionData();
  if (sessionData?.NI) {
    return String(sessionData.NI).replace(/\D/g, "");
  }
  return "";
}
