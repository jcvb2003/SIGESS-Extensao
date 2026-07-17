import type { CadastroSession } from "../../shared/types";
import { StorageService } from "../services/storage";

export const CADASTRO_SESSION_STORAGE_KEY = "sigessActiveCadastro";

export async function getActiveCadastroSession(): Promise<CadastroSession | null> {
  const result = await StorageService.get<CadastroSession>(CADASTRO_SESSION_STORAGE_KEY);
  const session: CadastroSession | undefined = result[CADASTRO_SESSION_STORAGE_KEY];
  return session?.sessionState === "active" ? session : null;
}

export async function saveCadastroSession(session: CadastroSession): Promise<void> {
  await StorageService.set({ [CADASTRO_SESSION_STORAGE_KEY]: session });
}

export async function removeCadastroSession(): Promise<void> {
  await StorageService.remove(CADASTRO_SESSION_STORAGE_KEY);
}
