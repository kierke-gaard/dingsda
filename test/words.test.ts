import { describe, it, expect } from 'vitest';
import {
  MemorySeenWords, StaticWordSource, slugify, spokenText, toAgeClass, validateWordList,
  type AgeClass, type Word,
} from '../src/words.js';

const mkWords = (): Word[] => {
  const out: Word[] = [];
  for (const age of [3, 4, 5, 6] as AgeClass[]) {
    for (let i = 0; i < 10; i++) {
      const word = `Wort${String.fromCharCode(65 + i)}${'x'.repeat(age)}`;
      out.push({ id: slugify(word), word, article: 'der', age, category: 'T' });
    }
  }
  return out;
};

const lcg = (seed = 42) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('toAgeClass', () => {
  it('clamps and floors', () => {
    expect(toAgeClass(1)).toBe(3);
    expect(toAgeClass(0)).toBe(3);
    expect(toAgeClass(2.9)).toBe(3);
    expect(toAgeClass(4.9)).toBe(4);
    expect(toAgeClass(6)).toBe(6);
    expect(toAgeClass(9)).toBe(6);
  });
});

describe('slugify/spokenText', () => {
  it('handles umlauts', () => {
    expect(slugify('Fußball')).toBe('fussball');
    expect(slugify('Bär')).toBe('baer');
    expect(slugify('Ölkännchen')).toBe('oelkaennchen');
  });
  it('speaks with article', () => {
    expect(spokenText({ id: 'x', word: 'Regenschirm', article: 'der', age: 4, category: 'x' })).toBe('der Regenschirm');
  });
});

describe('StaticWordSource', () => {
  it('never repeats and exhausts', () => {
    const all = mkWords();
    const src = new StaticWordSource(all, 6, new MemorySeenWords(), lcg());
    const got: string[] = [];
    for (let w = src.next(); w; w = src.next()) got.push(w.id);
    expect(got.length).toBe(all.length);
    expect(new Set(got).size).toBe(all.length);
    expect(src.next()).toBeUndefined();
  });

  it('only gives words of own or younger classes', () => {
    const src4 = new StaticWordSource(mkWords(), 4, new MemorySeenWords(), lcg(7));
    for (let w = src4.next(); w; w = src4.next()) expect(w.age).toBeLessThanOrEqual(4);
    const src3 = new StaticWordSource(mkWords(), 3, new MemorySeenWords(), lcg(7));
    let n = 0;
    for (let w = src3.next(); w; w = src3.next()) { expect(w.age).toBe(3); n++; }
    expect(n).toBe(10);
  });

  it('own class comes first with random=0', () => {
    const src = new StaticWordSource(mkWords(), 5, new MemorySeenWords(), () => 0);
    expect(src.next()!.age).toBe(5);
  });

  it('respects pre-seen words', () => {
    const all = mkWords();
    const seen = new MemorySeenWords();
    all.filter((w) => w.age === 3).forEach((w) => seen.add(w.id));
    const src = new StaticWordSource(all, 3, seen, lcg());
    expect(src.next()).toBeUndefined();
  });

  it('mixes roughly 70/30 own/younger', () => {
    const big: Word[] = [];
    for (const age of [3, 6] as AgeClass[]) {
      for (let i = 0; i < 500; i++) big.push({ id: `w${age}-${i}`, word: `W${age}${i}`, article: 'die', age, category: 'T' });
    }
    const src = new StaticWordSource(big, 6, new MemorySeenWords(), lcg(3));
    let own = 0;
    for (let i = 0; i < 300; i++) if (src.next()!.age === 6) own++;
    expect(own / 300).toBeGreaterThan(0.6);
    expect(own / 300).toBeLessThan(0.8);
  });
});

describe('validateWordList', () => {
  const ok: Word = { id: 'hund', word: 'Hund', article: 'der', age: 3, category: 'Tiere' };
  it('accepts valid', () => expect(validateWordList([ok])).toEqual([]));
  it('flags duplicates', () => {
    expect(validateWordList([ok, { ...ok, id: 'hund2' }]).length).toBeGreaterThan(0);
    expect(validateWordList([ok, { ...ok }]).length).toBeGreaterThan(0);
  });
  it('flags bad fields', () => {
    expect(validateWordList([{ ...ok, id: 'x' }]).length).toBe(1);
    expect(validateWordList([{ ...ok, article: 'ein' as never }]).length).toBe(1);
    expect(validateWordList([{ ...ok, age: 7 as never }]).length).toBe(1);
    expect(validateWordList([{ ...ok, category: '' }]).length).toBe(1);
    expect(validateWordList([{ ...ok, id: 'hund', word: 'hund' }]).length).toBe(1);
    expect(validateWordList([{ ...ok, word: ' Hund' }]).length).toBeGreaterThan(0);
  });
});
