import { describe, expect, it } from "vitest";
import { enqueueCadastroSessionWork } from "./cadastro-session-queue";

describe("enqueueCadastroSessionWork", () => {
  it("executa eventos da mesma sessão na ordem recebida", async () => {
    const execution: string[] = [];
    let releaseFirst: (() => void) | undefined;
    let signalFirstStarted: (() => void) | undefined;
    const firstGate = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const firstStarted = new Promise<void>((resolve) => { signalFirstStarted = resolve; });

    const first = enqueueCadastroSessionWork("sessao-1", async () => {
      execution.push("inicio-1");
      signalFirstStarted?.();
      await firstGate;
      execution.push("fim-1");
    });
    const second = enqueueCadastroSessionWork("sessao-1", async () => {
      execution.push("evento-2");
    });

    await firstStarted;
    expect(execution).toEqual(["inicio-1"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(execution).toEqual(["inicio-1", "fim-1", "evento-2"]);
  });

  it("não bloqueia eventos de sessões diferentes", async () => {
    const execution: string[] = [];
    await Promise.all([
      enqueueCadastroSessionWork("sessao-1", async () => { execution.push("sessao-1"); }),
      enqueueCadastroSessionWork("sessao-2", async () => { execution.push("sessao-2"); }),
    ]);
    expect(execution).toHaveLength(2);
    expect(execution).toContain("sessao-1");
    expect(execution).toContain("sessao-2");
  });
});
