import { describe, it, expect } from 'vitest';
import { handle, initialState, type GameState, type Key } from '../src/game.js';

const words = ['A', 'B', 'C'];
const mk = (list: string[] = [...words]) => () => list.shift();
const step = (s: GameState<string>, k: Key, nw = mk(), now = 10_000) => handle(s, k, nw, now);
const active = (): GameState<string> => step(initialState<string>(), 'space').state;

describe('game state machine', () => {
  it('space in ready starts a round and speaks', () => {
    const r = step(initialState<string>(), 'space');
    expect(r.state.phase).toBe('active');
    expect(r.state.current).toBe('A');
    expect(r.effects).toEqual([{ type: 'speak', word: 'A' }, { type: 'movie', word: 'A' }]);
  });

  it('space in active repeats without score change or new word', () => {
    const s = active();
    const nw = mk(['X']);
    const r = handle(s, 'space', nw, 0);
    expect(r.state).toBe(s);
    expect(r.effects).toEqual([{ type: 'speak', word: 'A' }, { type: 'movie', word: 'A' }]);
    expect(nw()).toBe('X');
  });

  it('enter is a hit with art and reveal', () => {
    const r = step(active(), 'enter');
    expect(r.state.phase).toBe('result');
    expect(r.state.score).toEqual({ hits: 1, misses: 0, skips: 0 });
    expect(r.state.lastResult).toBe('hit');
    expect(r.effects).toEqual([{ type: 'art', kind: 'hit' }, { type: 'reveal', word: 'A' }]);
  });

  it('miss counts as miss', () => {
    const r = step(active(), 'miss');
    expect(r.state.score).toEqual({ hits: 0, misses: 1, skips: 0 });
    expect(r.state.lastResult).toBe('miss');
    expect(r.effects).toEqual([{ type: 'art', kind: 'miss' }, { type: 'reveal', word: 'A' }]);
  });

  it('skip counts only as skip, no reveal', () => {
    const r = step(active(), 'skip');
    expect(r.state.phase).toBe('ready');
    expect(r.state.score).toEqual({ hits: 0, misses: 0, skips: 1 });
    expect(r.effects).toEqual([{ type: 'art', kind: 'skip' }]);
  });

  it('enter/miss/skip in ready are ignored', () => {
    const s = initialState<string>();
    for (const k of ['enter', 'miss', 'skip'] as Key[]) {
      const r = step(s, k);
      expect(r.state).toBe(s);
      expect(r.effects).toEqual([]);
    }
  });

  it('space in result goes to next word after debounce', () => {
    const res = handle(active(), 'enter', mk(), 1000).state;
    const r = handle(res, 'space', mk(['N']), 1500);
    expect(r.state.phase).toBe('active');
    expect(r.state.current).toBe('N');
    expect(r.effects).toEqual([{ type: 'speak', word: 'N' }, { type: 'movie', word: 'N' }]);
  });

  it('space within 400ms in result is ignored', () => {
    const res = handle(active(), 'miss', mk(), 1000).state;
    const r = handle(res, 'space', mk(['N']), 1399);
    expect(r.state).toBe(res);
    expect(r.effects).toEqual([]);
  });

  it('no words left finishes the game', () => {
    const r = step(initialState<string>(), 'space', () => undefined);
    expect(r.state.phase).toBe('finished');
    expect(r.effects).toEqual([{ type: 'noWordsLeft' }]);
  });

  it.each(['ready', 'active', 'result'] as const)('escape from %s asks and "no" returns', (phase) => {
    let s: GameState<string>;
    if (phase === 'ready') s = initialState<string>();
    else if (phase === 'active') s = active();
    else s = handle(active(), 'enter', mk(), 0).state;
    const c = step(s, 'escape').state;
    expect(c.phase).toBe('confirmQuit');
    expect(c.prevPhase).toBe(phase);
    expect(step(c, 'no').state.phase).toBe(phase);
    expect(step(c, 'escape').state.phase).toBe(phase);
  });

  it('yes in confirmQuit quits', () => {
    const c = step(initialState<string>(), 'escape').state;
    const r = step(c, 'yes');
    expect(r.state.phase).toBe('finished');
    expect(r.effects).toEqual([{ type: 'quit' }]);
  });

  it('space/enter in confirmQuit are ignored', () => {
    const c = step(active(), 'escape').state;
    expect(step(c, 'space').state).toBe(c);
    expect(step(c, 'enter').effects).toEqual([]);
  });

  it('yes/no outside confirmQuit are ignored', () => {
    const s = active();
    expect(step(s, 'yes').state).toBe(s);
    expect(step(s, 'no').state).toBe(s);
  });

  it('does not mutate the old state', () => {
    const s = active();
    const copy = JSON.parse(JSON.stringify(s));
    step(s, 'enter');
    expect(s).toEqual(copy);
  });

  it('replay in result shows the movie and speaks again without changing state', () => {
    const s = step(active(), 'enter').state;
    const r = step(s, 'replay');
    expect(r.state).toBe(s);
    expect(r.effects).toEqual([{ type: 'movie', word: 'A' }, { type: 'speak', word: 'A' }]);
  });

  it('only emits a movie effect together with speak, and never in ready or confirmQuit', () => {
    const keys: Key[] = ['space', 'enter', 'miss', 'skip', 'escape', 'yes', 'no', 'replay'];
    const base = initialState<string>();
    const states: GameState<string>[] = [
      base,
      active(),
      step(active(), 'enter').state,
      step(active(), 'escape').state,
      step(step(active(), 'enter').state, 'escape').state,
      { ...base, phase: 'finished', current: 'A' },
    ];
    for (const s of states) {
      for (const k of keys) {
        const r = handle(s, k, mk(), 100_000);
        if (r.effects.some((e) => e.type === 'movie')) {
          expect(r.effects.some((e) => e.type === 'speak')).toBe(true);
          expect(['active', 'result']).toContain(r.state.phase);
        }
      }
    }
  });
});
