import { describe, it, expect } from 'vitest';
import { parseArgs } from '../src/args.js';
import { initialState, type GameState } from '../src/game.js';
import { mapKey, renderLines, renderScore, type View } from '../src/ui.js';
import { stripAnsi, visibleWidth } from '../src/term.js';
import { HIT_ART, MISS_ART, SKIP_ART, TITLE_ART, BYE_ART } from '../src/art.js';
import type { Movie } from '../src/movie.js';
import type { Word } from '../src/words.js';

const word: Word = { id: 'geheimwort', word: 'Geheimwort', article: 'das', age: 4, category: 'T' };
const bigFrame = (c: string) => ({ lines: Array.from({ length: 10 }, () => c.repeat(32)), mask: Array(10).fill('y'.repeat(32)) });
const movie: Movie = { id: 'm', frames: [bigFrame('1'), bigFrame('2'), bigFrame('3')] };
const resultState = (): GameState<Word> => ({ ...initialState<Word>(), phase: 'result', current: word });
const text = (v: View, c = 80, r = 30) => stripAnsi(renderLines(v, c, r).join('\n'));

describe('rendering', () => {
  it('never shows the word before the result', () => {
    const base = initialState<Word>();
    for (const phase of ['ready', 'active', 'confirmQuit'] as const) {
      const state: GameState<Word> = { ...base, phase, current: word };
      expect(text({ state, age: 4 })).not.toContain('Geheimwort');
      expect(text({ state, age: 4 }, 30, 10)).not.toContain('Geheimwort');
    }
  });

  it('reveals the word in the result phase', () => {
    const state: GameState<Word> = { ...initialState<Word>(), phase: 'result', current: word };
    const t = text({ state, age: 4, reveal: word, art: { kind: 'hit', lines: HIT_ART[0]! } });
    expect(t).toContain('Das Wort war: das Geheimwort');
  });

  it('shows prompts and quit confirmation', () => {
    const s = initialState<Word>();
    expect(text({ state: s, age: 5 })).toContain('Drück die LEERTASTE');
    expect(text({ state: { ...s, phase: 'active' }, age: 5 })).toContain('Erklär das Wort!');
    expect(text({ state: { ...s, phase: 'confirmQuit' }, age: 5 })).toContain('Wirklich beenden? (j/n)');
  });

  it('uses compact layout in small terminals', () => {
    const state = { ...initialState<Word>(), score: { hits: 3, misses: 1, skips: 0 } };
    const t = text({ state, age: 3 }, 30, 10);
    expect(t).toContain('GEWUSST 3 | NICHT GEWUSST 1');
  });

  it('never exceeds terminal size', () => {
    const state: GameState<Word> = { ...initialState<Word>(), phase: 'result', score: { hits: 50, misses: 2, skips: 0 } };
    for (const [c, r] of [[80, 24], [120, 40], [40, 20], [39, 19], [30, 8]] as const) {
      const lines = renderLines({ state, age: 4, reveal: word, art: { kind: 'hit', lines: HIT_ART[1]! } }, c, r);
      expect(lines.length).toBeLessThanOrEqual(r);
      for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(c);
    }
  });

  it('scales score bars and shows exact numbers', () => {
    const lines = renderScore({ hits: 40, misses: 0, skips: 0 }, 80, 6).map(stripAnsi);
    expect(lines.length).toBe(8);
    expect(lines.join('\n')).toContain('40');
    expect(lines.filter((l) => l.includes('███')).length).toBe(6);
  });
});

describe('art', () => {
  it('fits 12 lines x 40 columns', () => {
    for (const a of [...HIT_ART, ...MISS_ART, SKIP_ART, TITLE_ART, BYE_ART]) {
      expect(a.length).toBeLessThanOrEqual(12);
      for (const l of a) expect(l.length).toBeLessThanOrEqual(40);
    }
  });
});

describe('mapKey', () => {
  const k = (name: string, extra = {}) => mapKey(undefined, { name, ...extra });
  it('maps keys', () => {
    expect(k('space')).toBe('space');
    expect(k('return')).toBe('enter');
    expect(k('backspace')).toBe('miss');
    expect(k('delete')).toBe('miss');
    expect(k('right')).toBe('skip');
    expect(mapKey('s', { name: 's' })).toBe('skip');
    expect(k('escape')).toBe('escape');
    expect(mapKey('j', { name: 'j' })).toBe('yes');
    expect(mapKey('y', { name: 'y' })).toBe('yes');
    expect(mapKey('n', { name: 'n' })).toBe('no');
    expect(k('c', { ctrl: true })).toBe('exit');
  });
  it('ignores the rest', () => {
    expect(k('up')).toBeUndefined();
    expect(k('down')).toBeUndefined();
    expect(k('left')).toBeUndefined();
    expect(mapKey('x', { name: 'x' })).toBeUndefined();
  });
});

describe('parseArgs', () => {
  it('parses flags', () => {
    expect(parseArgs(['--age', '5', '--silent'])).toMatchObject({ age: 5, silent: true });
    expect(parseArgs(['--age=4']).age).toBe(4);
    expect(parseArgs(['setup']).setup).toBe(true);
    expect(parseArgs(['--test-audio']).testAudio).toBe(true);
    expect(parseArgs(['--help']).help).toBe(true);
  });
  it('rejects bad input', () => {
    expect(() => parseArgs(['--age', 'x'])).toThrow();
    expect(() => parseArgs(['--foo'])).toThrow();
  });
});

describe('movie', () => {
  const art = { kind: 'hit' as const, lines: HIT_ART[0]! };
  it('shows the current frame in the result phase', () => {
    for (const frame of [0, 1, 2]) {
      const t = text({ state: resultState(), age: 4, reveal: word, art, movie: { movie, startedAt: 0, frame } });
      expect(t).toContain(String(frame + 1).repeat(32));
      expect(t).not.toContain(String((frame + 1) % 3 + 1).repeat(32));
      expect(t).toContain('Das Wort war: das Geheimwort');
    }
  });
  it('shows a verdict line instead of the side art in narrow terminals', () => {
    const t = text({ state: resultState(), age: 4, reveal: word, art, movie: { movie, startedAt: 0, frame: 0 } }, 70, 30);
    expect(t).toContain('SUPER!');
    expect(t).toContain('1'.repeat(32));
  });
  it('shows the movie while the word is being explained, but not in ready or confirmQuit', () => {
    for (const phase of ['ready', 'confirmQuit'] as const) {
      const state: GameState<Word> = { ...initialState<Word>(), phase, current: word };
      expect(text({ state, age: 4, movie: { movie, startedAt: 0, frame: 2 } })).not.toContain('3'.repeat(32));
    }
    const active: GameState<Word> = { ...initialState<Word>(), phase: 'active', current: word };
    const t = text({ state: active, age: 4, movie: { movie, startedAt: 0, frame: 2 } });
    expect(t).toContain('3'.repeat(32));
    expect(t).not.toContain('Geheimwort');
  });
  it('never exceeds terminal size', () => {
    const state: GameState<Word> = { ...resultState(), score: { hits: 50, misses: 2, skips: 0 } };
    for (const [c, r] of [[80, 24], [120, 40], [76, 24], [75, 24], [40, 20], [39, 19], [30, 8]] as const) {
      const lines = renderLines({ state, age: 4, reveal: word, art, movie: { movie, startedAt: 0, frame: 2 } }, c, r);
      expect(lines.length).toBeLessThanOrEqual(r);
      for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(c);
    }
  });
  it('keeps the whole movie visible at 80x24', () => {
    const t = text({ state: resultState(), age: 4, reveal: word, art, movie: { movie, startedAt: 0, frame: 0 } }, 80, 24);
    expect(t.split('\n').filter((l) => l.includes('1'.repeat(32)))).toHaveLength(10);
  });
  it('renders intro and outro frames within the terminal size', () => {
    for (const kind of ['intro', 'outro'] as const) {
      for (const frame of [0, 4]) {
        const m: Movie = { id: kind, frames: Array.from({ length: 5 }, (_, i) => bigFrame(String(i))) };
        const v: View = { state: initialState<Word>(), age: 4, [kind]: { movie: m, frame } };
        expect(text(v)).toContain(String(frame).repeat(32));
        for (const [c, r] of [[80, 24], [120, 40], [40, 20]] as const) {
          const lines = renderLines(v, c, r);
          expect(lines.length).toBeLessThanOrEqual(r);
          for (const l of lines) expect(visibleWidth(l)).toBeLessThanOrEqual(c);
        }
      }
    }
  });
  it('maps w to replay', () => {
    expect(mapKey('w', { name: 'w', sequence: 'w' } as never)).toBe('replay');
  });
});
