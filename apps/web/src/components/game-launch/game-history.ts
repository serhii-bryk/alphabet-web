export const gameHistoryKey = '__brandGameView';

/** Close open games only when the player leaves the history entry created for them. */
export function gameHistoryAction(
  state: unknown,
  entry: number | null,
  pendingBack: boolean,
): 'ignore' | 'close' {
  if (pendingBack || entry === null) return 'ignore';
  if (isRecord(state) && state[gameHistoryKey] === entry) return 'ignore';
  return 'close';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
