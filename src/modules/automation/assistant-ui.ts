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

  updateAssistantVisibility(settings.assistantSide || 'right');
  updateAssistantData(data);
}

function hideAssistant(): void {
  const root = document.getElementById(ID_ASSISTANT);
  if (root) root.style.display = 'none';
}

function updateAssistantVisibility(side: 'left' | 'right'): void {
  const root = document.getElementById(ID_ASSISTANT);

  if (isSIGESSFormPage()) {
    if (!root && document.body) injectAssistantUI(side);
    const el = document.getElementById(ID_ASSISTANT);
    if (el) {
      el.style.display = 'flex';
      el.style.right = side === 'right' ? '15px' : 'auto';
      el.style.left = side === 'left' ? '15px' : 'auto';
    }
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

function injectAssistantUI(side: 'left' | 'right'): void {
  if (document.getElementById(ID_ASSISTANT)) return;

  const root = document.createElement('div');
  root.id = ID_ASSISTANT;
  root.style.cssText = `
    position: fixed;
    bottom: 15px;
    ${side}: 15px;
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
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 10px 14px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  `;
  
  const headerLeft = document.createElement('div');
  headerLeft.style.display = 'flex';
  headerLeft.style.alignItems = 'center';
  headerLeft.style.gap = '8px';
  headerLeft.innerHTML = `
    <div style="width: 8px; height: 8px; background: #38bdf8; border-radius: 50%; box-shadow: 0 0 6px #38bdf8;"></div>
    <span style="font-size: 11px; font-weight: 700; color: #f8fafc; letter-spacing: 0.5px;">ASSISTENTE SIGESS</span>
  `;

  const flipBtn = document.createElement('button');
  flipBtn.innerHTML = `
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7 16l-4-4 4-4m10 0l4 4-4 4M3 12h18"/>
    </svg>
  `;
  flipBtn.title = "Mudar lado do assistente";
  flipBtn.style.cssText = `
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 4px;
    transition: all 0.2s;
  `;
  flipBtn.onmouseover = () => { flipBtn.style.color = '#38bdf8'; flipBtn.style.background = 'rgba(56, 189, 248, 0.1)'; };
  flipBtn.onmouseout = () => { flipBtn.style.color = '#94a3b8'; flipBtn.style.background = 'transparent'; };
  
  flipBtn.onclick = async () => {
    const result = await chrome.storage.local.get("sigessSettings");
    const settings = result.sigessSettings || {};
    const newSide = settings.assistantSide === 'left' ? 'right' : 'left';
    
    await chrome.storage.local.set({
      sigessSettings: { ...settings, assistantSide: newSide }
    });
    
    // O onChanged disparará o updateAssistantStatus, mas vamos aplicar logo para feeling instantâneo
    updateAssistantVisibility(newSide);
  };

  header.appendChild(headerLeft);
  header.appendChild(flipBtn);
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
