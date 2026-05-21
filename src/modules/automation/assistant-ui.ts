const ID_ASSISTANT = "sigess-assistant-root";

/**
 * A UI de preenchimento agora vive no Web.
 * Mantemos estas funcoes como no-op para preservar o fluxo de captura
 * sem continuar injetando widgets no DOM do SIGESS.
 */
export function isSIGESSFormPage(): boolean {
  return false;
}

export async function updateAssistantStatus(): Promise<void> {
  removeAssistantUI();
}

export function removeAssistantUI(): void {
  const existing = document.getElementById(ID_ASSISTANT);
  if (existing) {
    existing.remove();
  }
}
