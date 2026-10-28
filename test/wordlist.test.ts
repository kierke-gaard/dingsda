import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateWordList, type Word } from '../src/words.js';

const load = (age: number): Word[] =>
  JSON.parse(readFileSync(new URL(`../data/words/age${age}.json`, import.meta.url), 'utf8'));
const all = [3, 4, 5, 6].flatMap(load);

describe('bundled word list', () => {
  it('is valid', () => expect(validateWordList(all)).toEqual([]));
  for (const age of [3, 4, 5, 6]) {
    it(`age${age}.json has only age ${age} and enough words`, () => {
      const list = load(age);
      expect(list.every((w) => w.age === age)).toBe(true);
      expect(list.length).toBeGreaterThanOrEqual(230);
    });
  }
});
