const queues = new Map<string, Promise<void>>();

/**
 * Serializa somente eventos da mesma sessão. Sessões distintas não bloqueiam
 * uma à outra e uma falha anterior não interrompe os próximos eventos.
 */
export function enqueueCadastroSessionWork<T>(
  sessionId: string,
  work: () => Promise<T>,
): Promise<T> {
  const previous = queues.get(sessionId) ?? Promise.resolve();
  const result = previous.catch(() => undefined).then(work);
  const tail = result.then(() => undefined, () => undefined);
  queues.set(sessionId, tail);

  void tail.finally(() => {
    if (queues.get(sessionId) === tail) queues.delete(sessionId);
  });

  return result;
}
