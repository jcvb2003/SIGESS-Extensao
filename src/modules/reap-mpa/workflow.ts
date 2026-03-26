import { State } from './session-state';
import { Utils } from './utils/dom-utils';
import { Page1 } from './steps/step-identification';
import { Page2 } from './steps/step-activity';
import { Page3 } from './steps/step-monthly-production';
import { IWorkflowManager } from "./types";
export const WorkflowManager: IWorkflowManager & {
  start: () => void;
  pause: () => void;
  loop: () => Promise<void>;
} = {
  start() {
    if (State.isRunning) return;
    State.isRunning = true;
    State.isPaused = false;
    State.stopRequested = false;
    if ((window as any).refreshSigessUI) (window as any).refreshSigessUI();
    console.log("REAP: Start/Resume...");
    this.loop();
  },
  pause() {
    State.stopRequested = true;
    State.isRunning = true;
    State.isPausing = true;
    State.isPaused = false;
    console.log("REAP: Pausando...");
    if ((window as any).refreshSigessUI) (window as any).refreshSigessUI();
  },
  stop() {
    State.stopRequested = true;
    State.isRunning = false;
    State.isPaused = false;
    State.isPausing = false;
    console.log("REAP: Stop total.");
    if ((window as any).refreshSigessUI) (window as any).refreshSigessUI();
  },
  async loop() {
    if (!State.isRunning) return;
    if (State.stopRequested) {
        if (State.isPausing) {
           State.isRunning = false;
           State.isPaused = true;
           State.isPausing = false;
           console.log("REAP: Pausado com sucesso.");
           if ((window as any).refreshSigessUI) (window as any).refreshSigessUI();
        }
        return;
    }
    try {
      if (Page1.isCurrentPage()) {
        await Page1.execute(this);
        if ((window as any).refreshSigessUI)
          (window as any).refreshSigessUI();
        await Utils.waitFor(() => !Page1.isCurrentPage(), 5000);
        setTimeout(() => this.loop(), 1000);
      } else if (Page2.isCurrentPage()) {
        await Page2.execute(this);
        if ((window as any).refreshSigessUI)
          (window as any).refreshSigessUI();
        await Utils.waitFor(() => !Page2.isCurrentPage(), 5000);
        setTimeout(() => this.loop(), 1000);
      } else if (Page3.isCurrentPage()) {
        if (State.turboMode) {
          console.log("REAP: Interceptando Página 3 para Injeção Direta Turbo API.");
          this.stop(); // Desliga a UI visual
          if ((globalThis as any).startTurboApi) {
             (globalThis as any).startTurboApi();
          } else {
             alert("A página não injetou o painel invisível do Turbo ainda.");
          }
        } else {
          await Page3.execute(this);
        }
      } else {
        setTimeout(() => this.loop(), 2000);
      }
    } catch (e) {
      console.error("Erro Manager:", e);
      this.stop();
    }
  },
};
