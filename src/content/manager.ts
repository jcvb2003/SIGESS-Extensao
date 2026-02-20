import { State } from './state';
import { Utils } from './utils';
import { Page1 } from './pages/page1';
import { Page2 } from './pages/page2';
import { Page3 } from './pages/page3';
import { IWorkflowManager } from './types';

export const Manager: IWorkflowManager & { start: () => void, pause: () => void, loop: () => Promise<void> } = {
    start() {
        if (State.isRunning) return;
        State.isRunning = true;
        State.isPaused = false;
        State.stopRequested = false;
        console.log("REAP: Start/Resume...");
        this.loop();
    },

    pause() {
        State.stopRequested = true;
        State.isRunning = false;
        State.isPaused = true;
        console.log("REAP: Pausado.");
        const btn = document.getElementById('sinpesca-reap-btn');
        if (btn) { btn.textContent = '▶ Continuar'; btn.style.background = '#28a745'; }
    },

    stop() {
        State.stopRequested = true;
        State.isRunning = false;
        State.isPaused = false;
        State.currentMonthIndex = 0;
        State.daysMap = {};
        State.production = [];
        console.log("REAP: Stop total.");
        const btn = document.getElementById('sinpesca-reap-btn');
        const select = document.getElementById('sinpesca-reap-gender') as HTMLSelectElement;
        if (btn) { btn.textContent = '▶ Iniciar'; btn.style.background = '#007bff'; }
        if (select) select.disabled = false;
    },

    async loop() {
        if (!State.isRunning || State.stopRequested) return;
        try {
            if (Page1.isCurrentPage()) {
                await Page1.execute(this);
                await Utils.waitFor(() => !Page1.isCurrentPage(), 5000);
                setTimeout(() => this.loop(), 1000);
            } else if (Page2.isCurrentPage()) {
                await Page2.execute(this);
                await Utils.waitFor(() => !Page2.isCurrentPage(), 5000);
                setTimeout(() => this.loop(), 1000);
            } else if (Page3.isCurrentPage()) {
                await Page3.execute(this);
                // Page3 calls stop() on finish, but we can ensure it here if needed.
                // The original code called stop() here:
                // await Page3.execute();
                // this.stop();
                // But Page3 calls stop() internally in my refactor if I copied correctly?
                // Checking Page3 refactor: yes, it calls manager.stop().
                // But wait, if Page3.execute finishes without stopRequested, it calls manager.stop().
                // If it was stopped mid-way, it returns early.
                // So calling this.stop() here again is redundant but safe.
            } else {
                setTimeout(() => this.loop(), 2000);
            }
        } catch (e) {
            console.error("Erro Manager:", e);
            this.stop();
        }
    }
};
