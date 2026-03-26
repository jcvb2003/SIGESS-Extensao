/**
 * 🛠️ SIGESS Turbo Debug Module
 * Ferramenta ativada/desativada conforme necessidade de debug do dev.
 */
export class TurboLogger {
    private readonly overlay: HTMLDivElement | null = null;

    constructor() { 
        if (globalThis.document !== undefined) this.createOverlay(); 
    }

    private createOverlay() {
        console.log("[SIGESS Turbo] Overlay disabled by request.");
        // Se precisar de UI overlay no futuro, implemente aqui
    }

    log(msg: string, type: 'info' | 'warn' | 'error' | 'success' | 'payload' = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const colors: Record<string, string> = { 
            info: '#00ff00', 
            warn: '#ffaa00', 
            error: '#ff3333', 
            success: '#00ffff', 
            payload: '#ff00ff' 
        };
        const color = colors[type] || '#fff';
        
        console.log(`%c[SIGESS Turbo] ${msg}`, `color: ${color}`);
        
        if (this.overlay) {
            const entry = document.createElement('div');
            entry.style.marginBottom = '6px';
            entry.style.borderLeft = `3px solid ${color}`;
            entry.style.paddingLeft = '6px';
            entry.innerHTML = `<span style="color:#888;font-size:9px">[${timestamp}]</span> <span style="color:${color}">${msg}</span>`;
            this.overlay.appendChild(entry);
            this.overlay.scrollTop = this.overlay.scrollHeight;
        }
    }

    show() { 
        if (this.overlay) this.overlay.style.display = 'block'; 
    }
}
