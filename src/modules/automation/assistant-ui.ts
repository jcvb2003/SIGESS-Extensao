import { PessoaData } from "../../shared/types";
import { fillSIGESSForm } from "./form-filler";

const ID_ASSISTANT = 'sigess-assistant-root';

/**
 * Verifica se a página atual é um formulário SIGESS.
 */
export function isSIGESSFormPage(): boolean {
  const host = globalThis.location.hostname;
  const path = globalThis.location.pathname;
  const isSigessDomain = host.includes("sigess") || host.includes("vercel.app");
  const isRegistration = path.includes("/registration");
  const isMemberEdit = path.includes("/members/") && path.split('/').filter(Boolean).length > 1;
  return isSigessDomain && (isRegistration || isMemberEdit);
}

/**
 * Atualiza o status visual do widget assistente.
 * Injeta ou oculta conforme o contexto da página e estado da captura.
 */
export async function updateAssistantStatus(): Promise<void> {
  const result = await chrome.storage.local.get("sigessSettings");
  const settings = result.sigessSettings || {};
  const data = settings.pessoaData as PessoaData;

  if (!settings.autoRegistrationEnabled) {
    hideAssistant();
    return;
  }

  updateAssistantVisibility();
  updateAssistantData(data);
}

function hideAssistant(): void {
  const root = document.getElementById(ID_ASSISTANT);
  if (root) root.style.display = 'none';
}

function updateAssistantVisibility(): void {
  const root = document.getElementById(ID_ASSISTANT);

  if (isSIGESSFormPage()) {
    if (!root && document.body) injectAssistantUI();
    const el = document.getElementById(ID_ASSISTANT);
    if (el) el.style.display = 'flex';
  } else if (root) {
    root.style.display = 'none';
  }
}

function updateAssistantData(data: PessoaData | undefined): void {
  const btn = document.getElementById('sigess-assistant-btn') as HTMLButtonElement;
  const status = document.getElementById('sigess-assistant-status');
  if (!btn || !status) return;

  const hasData = !!(data?.nome && data?.cpf);
  const isEditMode = globalThis.location.pathname.includes('/members/');

  status.innerText = hasData ? `Pronto: ${data.nome?.split(' ')[0]}` : 'Aguardando dados...';
  status.style.color = hasData ? '#10b981' : '#94a3b8';
  
  // Mudança 3: Texto do botão conforme especificação
  btn.innerText = isEditMode ? 'Atualizar Sócio' : 'Preencher Formulário';

  btn.disabled = !hasData;
  btn.style.opacity = hasData ? '1' : '0.5';
}

/**
 * Remove o widget assistente do DOM.
 */
export function removeAssistantUI(): void {
  const existing = document.getElementById(ID_ASSISTANT);
  if (existing) existing.remove();
}

// ── Construção do widget ─────────────────────────────────────────────────

function injectAssistantUI(): void {
  if (document.getElementById(ID_ASSISTANT)) return;

  const root = document.createElement('div');
  root.id = ID_ASSISTANT;
  root.style.cssText = `
    position: fixed;
    bottom: 15px;
    right: 15px;
    z-index: 2147483647;
    padding: 2px;
    background: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    min-width: 220px;
    transition: all 0.3s ease;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    gap: 8px;
  `;
  header.innerHTML = `
    <div style="width: 8px; height: 8px; background: #38bdf8; border-radius: 50%; box-shadow: 0 0 6px #38bdf8;"></div>
    <span style="font-size: 11px; font-weight: 700; color: #f8fafc; letter-spacing: 0.5px;">ASSISTENTE SIGESS</span>
  `;
  root.appendChild(header);

  const body = document.createElement('div');
  body.style.padding = '12px';

  const statusLine = document.createElement('div');
  statusLine.id = 'sigess-assistant-status';
  statusLine.style.cssText = `font-size: 10px; color: #94a3b8; margin-bottom: 10px;`;
  statusLine.innerText = 'Aguardando dados...';
  body.appendChild(statusLine);

  const button = document.createElement('button');
  button.id = 'sigess-assistant-btn';
  button.innerText = 'Preencher Formulário';
  button.disabled = true;
  button.style.cssText = `
    width: 100%;
    padding: 8px;
    background: #38bdf8;
    color: #0f172a;
    border: none;
    border-radius: 6px;
    font-weight: 700;
    font-size: 12px;
    cursor: pointer;
    transition: opacity 0.2s, transform 0.1s;
    opacity: 0.5;
  `;

  button.onmousedown = () => button.style.transform = 'scale(0.98)';
  button.onmouseup = () => button.style.transform = 'scale(1)';
  button.onclick = fillSIGESSForm;

  body.appendChild(button);
  root.appendChild(body);
  document.body.appendChild(root);

  updateAssistantStatus();
}
