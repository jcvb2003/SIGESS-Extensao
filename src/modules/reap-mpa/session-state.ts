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

const GLOBAL_KEY = "__sigessState";
if (!(globalThis as any)[GLOBAL_KEY]) {
  (globalThis as any)[GLOBAL_KEY] = new StateManager();
}

export const State = (globalThis as any)[GLOBAL_KEY] as StateManager;
