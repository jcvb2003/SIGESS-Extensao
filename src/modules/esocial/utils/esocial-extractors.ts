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
  // ONLY source of truth: eSocial session API
  // Each tab has its own session → each gets correct CPF
  const sessionCpf = await getBestCpfFromSession();
  if (sessionCpf && sessionCpf !== "SEMCPF" && sessionCpf !== "SEM_CPF") {
    return sessionCpf;
  }

  console.warn("[SIGESS] API DadosSessao retornou CPF vazio/nulo");
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
  // ONLY source of truth: eSocial session API
  // Each tab has its own session → each gets correct nome
  const sessionData = await fetchEsocialSessionData();
  if (sessionData?.Nome) {
    const cleaned = extractCleanName(sessionData.Nome);
    if (cleaned) return cleaned;
  }

  console.warn("[SIGESS] API DadosSessao retornou nome vazio/nulo");
  return "SEM_NOME";
}

export async function getBestCpfFromSession(): Promise<string> {
  const sessionData = await fetchEsocialSessionData();
  if (sessionData?.NI) {
    return String(sessionData.NI).replace(/\D/g, "");
  }
  return "";
}
