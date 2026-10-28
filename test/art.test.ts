import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadArtChecked } from '../src/movies.js';
import { parseMovies } from '../src/movie.js';
import { artDir } from '../src/paths.js';
import { slugify, type Word } from '../src/words.js';

const words: Word[] = [3, 4, 5, 6].flatMap((age) =>
  JSON.parse(readFileSync(new URL(`../data/words/age${age}.json`, import.meta.url), 'utf8')) as Word[]);
const { lib, errors } = loadArtChecked();

describe('art content', () => {
  it('loads and validates every movie', () => {
    expect(errors).toEqual([]);
    expect(lib.intro).toBeDefined();
    expect(lib.outro).toBeDefined();
  });

  it('keeps every word movie in the file of its own category', () => {
    const byId = new Map(words.map((w) => [w.id, w]));
    for (const w of words.map((x) => x.category).filter((c, i, a) => a.indexOf(c) === i)) {
      const file = new URL(`words/${slugify(w)}.txt`, artDir);
      let text = '';
      try { text = readFileSync(file, 'utf8'); } catch { continue; }
      for (const m of parseMovies(text, `${slugify(w)}.txt`)) {
        expect(byId.get(m.id), `unknown word id ${m.id}`).toBeDefined();
        expect(byId.get(m.id)!.category, `${m.id} is in the wrong file`).toBe(w);
      }
    }
    for (const id of lib.words.keys()) expect(byId.has(id), `unknown word id ${id}`).toBe(true);
  });

  it('has a category movie for every category', () => {
    for (const c of new Set(words.map((w) => w.category))) expect(lib.categories.has(c), c).toBe(true);
  });

  it('has at least 200 word movies', () => {
    expect(lib.words.size).toBeGreaterThanOrEqual(200);
  });
});
