export type Key = 'space' | 'enter' | 'miss' | 'skip' | 'escape' | 'yes' | 'no' | 'replay';
export type Phase = 'ready' | 'active' | 'result' | 'confirmQuit' | 'finished';
export interface Score { hits: number; misses: number; skips: number }
export interface GameState<W> {
  phase: Phase;
  current?: W;
  lastResult?: 'hit' | 'miss';
  prevPhase?: Phase;
  score: Score;
  lastResultAt?: number;
}
export type Effect<W> =
  | { type: 'speak'; word: W }
  | { type: 'art'; kind: 'hit' | 'miss' | 'skip' }
  | { type: 'reveal'; word: W }
  | { type: 'movie'; word: W }
  | { type: 'noWordsLeft' }
  | { type: 'quit' };

export const DEBOUNCE_MS = 400;

export function initialState<W>(): GameState<W> {
  return { phase: 'ready', score: { hits: 0, misses: 0, skips: 0 } };
}

export function handle<W>(
  state: GameState<W>,
  key: Key,
  nextWord: () => W | undefined,
  now: number,
): { state: GameState<W>; effects: Effect<W>[] } {
  const same = { state, effects: [] as Effect<W>[] };
  const { phase } = state;

  if (key === 'escape' && (phase === 'ready' || phase === 'active' || phase === 'result')) {
    return { state: { ...state, phase: 'confirmQuit', prevPhase: phase }, effects: [] };
  }

  if (phase === 'confirmQuit') {
    if (key === 'yes') return { state: { ...state, phase: 'finished' }, effects: [{ type: 'quit' }] };
    if (key === 'no' || key === 'escape') {
      return { state: { ...state, phase: state.prevPhase ?? 'ready', prevPhase: undefined }, effects: [] };
    }
    return same;
  }

  if (key === 'space' && (phase === 'ready' || phase === 'result')) {
    if (phase === 'result' && state.lastResultAt !== undefined && now - state.lastResultAt < DEBOUNCE_MS) {
      return same;
    }
    const word = nextWord();
    if (word === undefined) {
      return { state: { ...state, phase: 'finished' }, effects: [{ type: 'noWordsLeft' }] };
    }
    return { state: { ...state, phase: 'active', current: word }, effects: [{ type: 'speak', word }, { type: 'movie', word }] };
  }

  if (key === 'replay' && phase === 'result' && state.current !== undefined) {
    return { state, effects: [{ type: 'movie', word: state.current }, { type: 'speak', word: state.current }] };
  }

  if (phase === 'active' && state.current !== undefined) {
    const word = state.current;
    switch (key) {
      case 'space':
        return { state, effects: [{ type: 'speak', word }, { type: 'movie', word }] };
      case 'enter':
        return {
          state: { ...state, phase: 'result', lastResult: 'hit', lastResultAt: now,
            score: { ...state.score, hits: state.score.hits + 1 } },
          effects: [{ type: 'art', kind: 'hit' }, { type: 'reveal', word }],
        };
      case 'miss':
        return {
          state: { ...state, phase: 'result', lastResult: 'miss', lastResultAt: now,
            score: { ...state.score, misses: state.score.misses + 1 } },
          effects: [{ type: 'art', kind: 'miss' }, { type: 'reveal', word }],
        };
      case 'skip':
        return {
          state: { ...state, phase: 'ready', score: { ...state.score, skips: state.score.skips + 1 } },
          effects: [{ type: 'art', kind: 'skip' }],
        };
    }
  }
  return same;
}
