/** Keep conversation history bounded for DB size and model context. */
export function trimHistory<T>(history: T[], max = 40): T[] {
  if (history.length <= max) return history;
  return history.slice(history.length - max);
}
