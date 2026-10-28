import { color, visibleWidth, type Style } from './term.js';
import type { Word } from './words.js';

export type ColorCode = 'r' | 'g' | 'y' | 'b' | 'm' | 'c' | 'w' | 'k' | 'R' | 'G' | 'Y' | 'B' | 'M' | 'C' | 'W';
export interface Frame { lines: string[]; mask: string[] }
export interface Movie { id: string; frames: Frame[] }
export const MAX_W = 32;
export const MAX_H = 10;

const STYLES: Record<string, Style> = {
  r: 'red', g: 'green', y: 'yellow', b: 'blue', m: 'magenta', c: 'cyan', w: 'white', k: 'gray',
  R: 'redBright', G: 'greenBright', Y: 'yellowBright', B: 'blueBright',
  M: 'magentaBright', C: 'cyanBright', W: 'whiteBright',
};

/** Throws an Error with "source:line: message" on syntax errors. */
export function parseMovies(text: string, source: string): Movie[] {
  const movies: Movie[] = [];
  let movie: Movie | undefined;
  let frame: Frame | undefined;
  let target: 'lines' | 'mask' | undefined;
  const fail = (n: number, msg: string): never => { throw new Error(`${source}:${n}: ${msg}`); };
  const trimEnd = (f: Frame): void => {
    while (f.lines.length > 0 && f.lines[f.lines.length - 1] === '') f.lines.pop();
    while (f.mask.length > 0 && f.mask[f.mask.length - 1] === '') f.mask.pop();
  };

  text.split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    if (raw.startsWith('@')) {
      const id = raw.slice(1).trim();
      if (!id) fail(n, 'movie id missing');
      if (frame) trimEnd(frame);
      movie = { id, frames: [] };
      movies.push(movie);
      frame = undefined;
      target = undefined;
      return;
    }
    if (raw === '>' || raw === '~') {
      if (!movie) return fail(n, `'${raw}' before any '@id'`);
      if (raw === '>') {
        if (frame) trimEnd(frame);
        frame = { lines: [], mask: [] };
        movie.frames.push(frame);
        target = 'lines';
      } else {
        if (!frame) return fail(n, "'~' before any '>'");
        target = 'mask';
      }
      return;
    }
    if (!frame || !target) {
      if (raw.startsWith('#') || raw.trim() === '') return;
      return fail(n, 'text outside of a frame');
    }
    frame[target].push(raw.replace(/\s+$/, ''));
  });
  if (frame) trimEnd(frame);
  return movies;
}

export function validateMovie(m: Movie, expectedFrames: number): string[] {
  const errors: string[] = [];
  if (m.frames.length !== expectedFrames) {
    errors.push(`${m.id}: expected ${expectedFrames} frames, got ${m.frames.length}`);
  }
  m.frames.forEach((f, i) => {
    const at = `${m.id} frame ${i + 1}`;
    if (f.lines.length > MAX_H) errors.push(`${at}: ${f.lines.length} lines (max ${MAX_H})`);
    if (f.lines.length === 0) errors.push(`${at}: empty`);
    f.lines.forEach((l, j) => {
      if (l.length > MAX_W) errors.push(`${at} line ${j + 1}: ${l.length} columns (max ${MAX_W})`);
      if (/[^\x20-\x7e]/.test(l)) errors.push(`${at} line ${j + 1}: non-ASCII character`);
    });
    if (f.mask.length > f.lines.length) errors.push(`${at}: mask has more lines than art`);
    f.mask.forEach((l, j) => {
      if (/[^rgybmcwkRGYBMCW. ]/.test(l)) errors.push(`${at} mask line ${j + 1}: bad mask letter`);
    });
  });
  return errors;
}

export function frameAt(elapsedMs: number, frameCount: number, frameMs = 1000): number {
  return Math.max(0, Math.min(frameCount - 1, Math.floor(elapsedMs / frameMs)));
}

export interface ArtLibrary {
  words: Map<string, Movie>;
  categories: Map<string, Movie>;
  intro?: Movie;
  outro?: Movie;
}

export function movieFor(word: Word, lib: ArtLibrary): Movie | undefined {
  return lib.words.get(word.id) ?? lib.categories.get(word.category);
}

export function movieWidth(m: Movie): number {
  return Math.max(0, ...m.frames.flatMap((f) => f.lines.map((l) => l.length)));
}

/** Coloured lines, padded to the widest line of the whole movie (no jumping between frames). */
export function renderFrame(frame: Frame, width: number): string[] {
  return frame.lines.map((line, i) => {
    const mask = frame.mask[i] ?? '';
    let out = '';
    let j = 0;
    while (j < line.length) {
      const code = mask[j] ?? '.';
      let k = j + 1;
      while (k < line.length && (mask[k] ?? '.') === code) k++;
      const chunk = line.slice(j, k);
      const style = STYLES[code];
      out += style ? color(chunk, style) : chunk;
      j = k;
    }
    return out + ' '.repeat(Math.max(0, width - visibleWidth(out)));
  });
}
