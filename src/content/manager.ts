import { State } from "./state";
import { Utils } from "./utils";
import { Page1 } from "./pages/page1";
import { Page2 } from "./pages/page2";
import { Page3 } from "./pages/page3";
import { IWorkflowManager } from "./types";
export const Manager: IWorkflowManager & {
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
    State.isRunning = false;
    State.isPaused = true;
    console.log("REAP: Pausado.");
    if ((window as any).refreshSigessUI) (window as any).refreshSigessUI();
  },
  stop() {
    State.stopRequested = true;
    State.isRunning = false;
    State.isPaused = false;
    console.log("REAP: Stop total.");
    if ((window as any).refreshSigessUI) (window as any).refreshSigessUI();
  },
  async loop() {
    if (!State.isRunning || State.stopRequested) return;
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
        await Page3.execute(this);
      } else {
        setTimeout(() => this.loop(), 2000);
      }
    } catch (e) {
      console.error("Erro Manager:", e);
      this.stop();
    }
  },
};
