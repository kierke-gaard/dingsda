import { describe, expect, it } from 'vitest';
import { frameAt, movieFor, parseMovies, renderFrame, validateMovie, type ArtLibrary, type Movie } from '../src/movie.js';
import { stripAnsi, visibleWidth } from '../src/term.js';
import type { Word } from '../src/words.js';

const SAMPLE = `# comment
@a
>
  /\\
 /__\\
~
  rr
>
 x
>
 y
@b
>
 z
`;

const frame = (lines: string[], mask: string[] = []) => ({ lines, mask });
const word = (id: string, category: string): Word => ({ id, word: id, article: 'der', age: 3, category });

describe('parseMovies', () => {
  it('parses several movies, verbatim leading spaces, short and missing masks', () => {
    const ms = parseMovies(SAMPLE, 't.txt');
    expect(ms.map((m) => m.id)).toEqual(['a', 'b']);
    expect(ms[0]!.frames).toHaveLength(3);
    expect(ms[0]!.frames[0]!.lines).toEqual(['  /\\', ' /__\\']);
    expect(ms[0]!.frames[0]!.mask).toEqual(['  rr']);
    expect(ms[0]!.frames[1]!.mask).toEqual([]);
  });
  it('drops trailing blank lines but keeps inner ones', () => {
    const [m] = parseMovies('@a\n>\nx\n\ny\n\n\n', 't');
    expect(m!.frames[0]!.lines).toEqual(['x', '', 'y']);
  });
  it('reports the line number of syntax errors', () => {
    expect(() => parseMovies('# c\n>\nx', 'f.txt')).toThrow('f.txt:2:');
    expect(() => parseMovies('@a\nstray', 'f.txt')).toThrow('f.txt:2:');
    expect(() => parseMovies('@a\n~\n', 'f.txt')).toThrow('f.txt:2:');
  });
});

describe('validateMovie', () => {
  const ok: Movie = { id: 'a', frames: [frame(['x']), frame(['x']), frame(['x'])] };
  it('accepts a valid movie', () => expect(validateMovie(ok, 3)).toEqual([]));
  it('rejects the wrong frame count', () => expect(validateMovie(ok, 5)).not.toEqual([]));
  it('rejects too wide and too tall frames', () => {
    expect(validateMovie({ id: 'a', frames: [frame(['x'.repeat(33)])] }, 1)).not.toEqual([]);
    expect(validateMovie({ id: 'a', frames: [frame(Array(11).fill('x'))] }, 1)).not.toEqual([]);
  });
  it('rejects non-ASCII and bad mask letters', () => {
    expect(validateMovie({ id: 'a', frames: [frame(['ä'])] }, 1)).not.toEqual([]);
    expect(validateMovie({ id: 'a', frames: [frame(['x'], ['q'])] }, 1)).not.toEqual([]);
  });
  it('rejects a mask with more lines than the art', () => {
    expect(validateMovie({ id: 'a', frames: [frame(['x'], ['r', 'r'])] }, 1)).not.toEqual([]);
  });
});

describe('frameAt', () => {
  it('maps elapsed time to a frame and clamps to the last', () => {
    expect([0, 999, 1000, 2500, 10000].map((t) => frameAt(t, 3))).toEqual([0, 0, 1, 2, 2]);
  });
});

describe('movieFor', () => {
  const w: Movie = { id: 'hund', frames: [] };
  const c: Movie = { id: 'Tiere', frames: [] };
  const lib: ArtLibrary = { words: new Map([['hund', w]]), categories: new Map([['Tiere', c]]) };
  it('prefers the word movie, then the category movie', () => {
    expect(movieFor(word('hund', 'Tiere'), lib)).toBe(w);
    expect(movieFor(word('katze', 'Tiere'), lib)).toBe(c);
    expect(movieFor(word('tisch', 'Haushalt'), lib)).toBeUndefined();
  });
});

describe('renderFrame', () => {
  it('groups equal mask letters into runs and strips back to the padded art', () => {
    const f = frame(['abcdefg'], ['yyy..rr']);
    const [line] = renderFrame(f, 10);
    expect(line!.match(/\x1b\[\d+m[^\x1b]+\x1b\[\d+m/g)).toHaveLength(2);
    expect(stripAnsi(line!)).toBe('abcdefg   ');
    expect(visibleWidth(line!)).toBe(10);
  });
  it('maps an uppercase letter to the bright variant', () => {
    const [bright] = renderFrame(frame(['x'], ['R']), 1);
    const [normal] = renderFrame(frame(['x'], ['r']), 1);
    expect(bright).not.toBe(normal);
    expect(stripAnsi(bright!)).toBe('x');
  });
});
