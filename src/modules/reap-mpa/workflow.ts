import { State } from './session-state';
import { Utils } from './utils/dom-utils';
import { Page1 } from './steps/step-identification';
import { Page2 } from './steps/step-activity';
import { Page3 } from './steps/step-monthly-production';
import { IWorkflowManager } from "./types";

const refreshUI = () => {
  if ((globalThis as any).refreshSigessUI) (globalThis as any).refreshSigessUI();
};

export const WorkflowManager: IWorkflowManager & {
  start: () => void;
  pause: () => void;
  stop: () => void;
  loop: () => Promise<void>;
  runPage: (page: any) => Promise<void>;
  runPage3: () => Promise<void>;
  handlePauseIfRequested: () => boolean;
} = {
  start() {
    if (State.isRunning) return;
    State.isRunning = true;
    State.isPaused = false;
    State.stopRequested = false;
    refreshUI();
    console.log("REAP: Start/Resume...");
    this.loop();
  },
  pause() {
    State.stopRequested = true;
    State.isRunning = true;
    State.isPausing = true;
    State.isPaused = false;
    console.log("REAP: Pausando...");
    refreshUI();
  },
  stop() {
    State.stopRequested = true;
    State.isRunning = false;
    State.isPaused = false;
    State.isPausing = false;
    console.log("REAP: Stop total.");
    refreshUI();
  },
  handlePauseIfRequested() {
    if (State.stopRequested) {
        if (State.isPausing) {
           State.isRunning = false;
           State.isPaused = true;
           State.isPausing = false;
           console.log("REAP: Pausado com sucesso.");
           refreshUI();
        }
        return true;
    }
    return false;
  },
  async runPage(page: any) {
    await page.execute(this);
    refreshUI();
    await Utils.waitFor(() => !page.isCurrentPage(), 5000);
    setTimeout(() => this.loop(), 1000);
  },
  async runPage3() {
    if (State.turboMode) {
      console.log("REAP: Interceptando Página 3 para Injeção Direta Turbo API.");
      this.stop(); 
      if ((globalThis as any).startTurboApi) {
         (globalThis as any).startTurboApi();
      } else {
         alert("A página não injetou o painel invisível do Turbo ainda.");
      }
    } else {
      await Page3.execute(this);
    }
  },
  async loop() {
    if (!State.isRunning || this.handlePauseIfRequested()) return;
    
    try {
      if (Page1.isCurrentPage()) await this.runPage(Page1);
      else if (Page2.isCurrentPage()) await this.runPage(Page2);
      else if (Page3.isCurrentPage()) await this.runPage3();
      else setTimeout(() => this.loop(), 2000);
    } catch (e) {
      console.error("Erro Manager:", e);
      this.stop();
    }
  },
};
