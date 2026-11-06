import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  FileSeenWords, MemorySeenWords, StaticWordSource, slugify, spokenText, toAgeClass, validateWordList,
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
  it('never repeats within a cycle, then starts a new one', () => {
    const all = mkWords();
    const src = new StaticWordSource(all, 6, new MemorySeenWords(), lcg());
    const got: string[] = [];
    for (let i = 0; i < all.length; i++) got.push(src.next()!.id);
    expect(new Set(got).size).toBe(all.length);
    const again = src.next();
    expect(again).toBeDefined();
    expect(again!.id).not.toBe(got[got.length - 1]);
  });

  it('only gives words of own or younger classes', () => {
    const src4 = new StaticWordSource(mkWords(), 4, new MemorySeenWords(), lcg(7));
    for (let i = 0; i < 20; i++) expect(src4.next()!.age).toBeLessThanOrEqual(4);
    const src3 = new StaticWordSource(mkWords(), 3, new MemorySeenWords(), lcg(7));
    const ids = new Set<string>();
    for (let i = 0; i < 10; i++) { const w = src3.next()!; expect(w.age).toBe(3); ids.add(w.id); }
    expect(ids.size).toBe(10);
  });

  it('own class comes first with random=0', () => {
    const src = new StaticWordSource(mkWords(), 5, new MemorySeenWords(), () => 0);
    expect(src.next()!.age).toBe(5);
  });

  it('respects pre-seen words and resets when all are seen', () => {
    const all = mkWords();
    const age3 = all.filter((w) => w.age === 3);
    const seen = new MemorySeenWords();
    age3.slice(0, 9).forEach((w) => seen.add(w.id));
    const src = new StaticWordSource(all, 3, seen, lcg());
    expect(src.next()!.id).toBe(age3[9]!.id);
    expect(src.next()).toBeDefined();
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

describe('FileSeenWords', () => {
  const tmp = () => join(mkdtempSync(join(tmpdir(), 'dingsda-')), 'sub', 'seen.json');

  it('persists add and delete', () => {
    const p = tmp();
    const a = new FileSeenWords(p);
    a.add('x'); a.add('y');
    expect(new FileSeenWords(p).has('x')).toBe(true);
    a.delete('x');
    const b = new FileSeenWords(p);
    expect(b.has('x')).toBe(false);
    expect(b.has('y')).toBe(true);
  });

  it('starts empty on missing or garbage file', () => {
    expect(new FileSeenWords(tmp()).has('x')).toBe(false);
    const p = tmp();
    new FileSeenWords(p).add('x');
    writeFileSync(p, '{not json');
    expect(new FileSeenWords(p).has('x')).toBe(false);
  });

  it('does not overlap across simulated restarts', () => {
    const p = tmp();
    const all = mkWords();
    const first = new StaticWordSource(all, 6, new FileSeenWords(p), lcg(1));
    const a = Array.from({ length: 15 }, () => first.next()!.id);
    const second = new StaticWordSource(all, 6, new FileSeenWords(p), lcg(2));
    const b = Array.from({ length: 25 }, () => second.next()!.id);
    expect(new Set([...a, ...b]).size).toBe(40);
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
