import { Manager } from './manager';
import { State } from './state';

const Draggable = {
    init(el: HTMLElement) {
        let isDragging = false, startY = 0, startTop = 0;
        el.addEventListener('mousedown', (e) => {
            if ((e.target as HTMLElement).tagName === 'BUTTON' || (e.target as HTMLElement).tagName === 'SELECT') return;
            isDragging = true; startY = e.clientY; startTop = el.offsetTop;
            el.style.cursor = 'grabbing'; e.preventDefault();
        });
        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            el.style.top = `${startTop + (e.clientY - startY)}px`;
            el.style.bottom = 'auto';
        });
        window.addEventListener('mouseup', () => { isDragging = false; el.style.cursor = 'move'; });
    }
};

const isReapPage = () => {
    const h = window.location.href;
    return h.includes('mpa.gov.br') && (h.includes('/manutencao/') || h.includes('/reap-simplificada/') || h.includes('cadastro/') || h.includes('informe-mensal'));
};

const injectButton = () => {
    let container = document.getElementById('sinpesca-reap-container');
    if (isReapPage()) {
        if (!container) {
            container = document.createElement('div');
            container.id = 'sinpesca-reap-container';
            container.style.cssText = `position: fixed; top: 120px; right: 20px; z-index: 100000; background: white; border: 2px solid #007bff; border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.4); display: flex; flex-direction: column; gap: 8px; padding: 12px; width: 180px; font-family: sans-serif; cursor: move;`;

            const title = document.createElement('div');
            title.innerText = '🤖 REAP 2025 v3.0';
            title.style.cssText = 'font-weight: bold; text-align: center; color: #007bff; border-bottom: 1px solid #eee; padding-bottom: 5px; font-size: 14px;';
            container.appendChild(title);

            const row = document.createElement('div');
            row.style.cssText = 'display: flex; justify-content: space-between; align-items: center;';
            const lbl = document.createElement('label'); lbl.innerText = 'Gênero:'; lbl.style.fontSize = '12px';
            const sel = document.createElement('select'); sel.id = 'sinpesca-reap-gender'; sel.style.fontSize = '12px';
            ['MASCULINO', 'FEMININO'].forEach(g => { const o = document.createElement('option'); o.value = g; o.innerText = g.charAt(0) + g.slice(1).toLowerCase(); sel.appendChild(o); });
            row.appendChild(lbl); row.appendChild(sel); container.appendChild(row);

            const btn = document.createElement('button');
            btn.id = 'sinpesca-reap-btn'; btn.textContent = '▶ Iniciar';
            btn.style.cssText = 'padding: 8px; background: #007bff; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;';
            btn.onclick = (e) => {
                e.stopPropagation();
                const text = btn.textContent || '';
                if (text.includes('Iniciar')) {
                    // Fresh start
                    State.gender = sel.value as any;
                    State.daysMap = {};
                    State.production = [];
                    State.currentMonthIndex = 0;
                    sel.disabled = true;
                    btn.textContent = '⏸ Pausar';
                    btn.style.background = '#ffc107';
                    Manager.start();
                } else if (text.includes('Continuar')) {
                    // Resume from pause
                    sel.disabled = true;
                    btn.textContent = '⏸ Pausar';
                    btn.style.background = '#ffc107';
                    Manager.start();
                } else if (text.includes('Pausar')) {
                    // Pause
                    Manager.pause();
                }
            };
            container.appendChild(btn);

            // Reset button
            const resetBtn = document.createElement('button');
            resetBtn.textContent = '🔄 Resetar';
            resetBtn.style.cssText = 'padding: 6px; background: #6c757d; color: white; border: none; border-radius: 4px; font-size: 11px; cursor: pointer; margin-top: 4px;';
            resetBtn.onclick = (e) => { e.stopPropagation(); Manager.stop(); };
            container.appendChild(resetBtn);

            Draggable.init(container);
            document.body.appendChild(container);
        } else { container.style.display = 'flex'; }
    } else {
        if (container) container.style.display = 'none';
        if (State.isRunning) Manager.pause();
    }
};

export const initUI = () => {
    const observer = new MutationObserver(() => injectButton());
    observer.observe(document.body, { childList: true, subtree: true });
    injectButton();
};
