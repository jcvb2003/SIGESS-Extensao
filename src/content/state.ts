import { FishProduction } from "./types";
class StateManager {
  public isRunning = false;
  public isPaused = false;
  public stopRequested = false;
  public gender: "MASCULINO" | "FEMININO" = "MASCULINO";
  public daysMap: Record<number, number> = {};
  public production: FishProduction[] = [];
  public currentMonthIndex = 0;
  public currentPage = 0;
  public monthlyProgress: Record<
    number,
    "pending" | "active" | "done" | "skipped"
  > = {};
  reset() {
    this.isRunning = false;
    this.isPaused = false;
    this.stopRequested = false;
    this.currentMonthIndex = 0;
    this.daysMap = {};
    this.production = [];
    this.currentPage = 0;
    this.monthlyProgress = {};
  }
}
export const State = new StateManager();
