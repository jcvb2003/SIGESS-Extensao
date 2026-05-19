export type LogLevel = "info" | "warning" | "error" | "debug";

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  module: string;
  message: string;
  metadata?: Record<string, unknown>;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 100;

  log(level: LogLevel, module: string, message: string, metadata?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      module,
      message,
      metadata,
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    this.print(entry);
    this.notifyListeners(entry);
  }

  info(module: string, message: string, metadata?: Record<string, unknown>) {
    this.log("info", module, message, metadata);
  }

  warning(module: string, message: string, metadata?: Record<string, unknown>) {
    this.log("warning", module, message, metadata);
  }

  error(module: string, message: string, metadata?: Record<string, unknown>) {
    this.log("error", module, message, metadata);
  }

  debug(module: string, message: string, metadata?: Record<string, unknown>) {
    this.log("debug", module, message, metadata);
  }

  getLogs(filter?: { level?: LogLevel; module?: string }): LogEntry[] {
    if (!filter) return this.logs;

    return this.logs.filter((log) => {
      if (filter.level && log.level !== filter.level) return false;
      if (filter.module && log.module !== filter.module) return false;
      return true;
    });
  }

  clear() {
    this.logs = [];
  }

  private print(entry: LogEntry) {
    const prefix = `[${entry.module}]`;
    const style = this.getConsoleStyle(entry.level);
    const message = `${prefix} ${entry.message}`;

    if (entry.metadata) {
      console.log(`%c${message}`, style, entry.metadata);
    } else {
      console.log(`%c${message}`, style);
    }
  }

  private getConsoleStyle(level: LogLevel): string {
    const styles = {
      info: "color: #0066cc; font-weight: bold;",
      warning: "color: #ff9900; font-weight: bold;",
      error: "color: #cc0000; font-weight: bold;",
      debug: "color: #666666;",
    };
    return styles[level];
  }

  private listeners: ((entry: LogEntry) => void)[] = [];

  onLog(callback: (entry: LogEntry) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners(entry: LogEntry) {
    this.listeners.forEach((callback) => callback(entry));
  }
}

export const logger = new Logger();
