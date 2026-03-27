/**
 * 🛠️ SIGESS Turbo Debug Module
 * Ferramenta ativada/desativada conforme necessidade de debug do dev.
 */
export class TurboLogger {
    log(msg: string, type: 'info' | 'warn' | 'error' | 'success' | 'payload' = 'info') {
        const colors: Record<string, string> = { 
            info: '#00ff00', 
            warn: '#ffaa00', 
            error: '#ff3333', 
            success: '#00ffff', 
            payload: '#ff00ff' 
        };
        const color = colors[type] || '#fff';
        
        console.log(`%c[SIGESS Turbo] ${msg}`, `color: ${color}`);
    }
}
