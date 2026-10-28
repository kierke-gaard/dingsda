export type AgeClass = 3 | 4 | 5 | 6;
export interface Word { id: string; word: string; article: 'der' | 'die' | 'das'; age: AgeClass; category: string }

export function toAgeClass(age: number): AgeClass {
  const a = Math.floor(age);
  if (a < 3) return 3;
  if (a > 6) return 6;
  return a as AgeClass;
}

export function spokenText(w: Word): string {
  return `${w.article} ${w.word}`;
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export interface SeenWords { has(id: string): boolean; add(id: string): void }
export class MemorySeenWords implements SeenWords {
  private ids = new Set<string>();
  has(id: string): boolean { return this.ids.has(id); }
  add(id: string): void { this.ids.add(id); }
}

export interface WordSource { next(): Word | undefined }

function shuffle<T>(items: T[], random: () => number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.floor(random() * (i + 1)));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

export class StaticWordSource implements WordSource {
  private own: Word[];
  private younger: Word[];

  constructor(
    all: Word[],
    age: AgeClass,
    private seen: SeenWords,
    private random: () => number = Math.random,
  ) {
    this.own = shuffle(all.filter((w) => w.age === age), random);
    this.younger = shuffle(all.filter((w) => w.age < age), random);
  }

  private take(pool: Word[]): Word | undefined {
    while (pool.length > 0) {
      const w = pool.pop()!;
      if (!this.seen.has(w.id)) return w;
    }
    return undefined;
  }

  next(): Word | undefined {
    const preferOwn = this.random() < 0.7;
    const [first, second] = preferOwn ? [this.own, this.younger] : [this.younger, this.own];
    const w = this.take(first) ?? this.take(second);
    if (w) this.seen.add(w.id);
    return w;
  }
}

export function validateWordList(words: Word[]): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const names = new Set<string>();
  for (const w of words) {
    const label = `"${w.word}" (${w.id})`;
    if (ids.has(w.id)) errors.push(`${label}: duplicate id`);
    ids.add(w.id);
    const lower = (w.word ?? '').toLowerCase();
    if (names.has(lower)) errors.push(`${label}: duplicate word`);
    names.add(lower);
    if (!w.word || w.word !== w.word.trim()) errors.push(`${label}: word empty or has surrounding spaces`);
    else if (w.word[0] !== w.word[0]!.toUpperCase() || w.word[0] === w.word[0]!.toLowerCase()) {
      errors.push(`${label}: word must start with an uppercase letter`);
    }
    if (w.id !== slugify(w.word ?? '')) errors.push(`${label}: id must equal slugify(word)`);
    if (!['der', 'die', 'das'].includes(w.article)) errors.push(`${label}: bad article`);
    if (![3, 4, 5, 6].includes(w.age)) errors.push(`${label}: bad age`);
    if (!w.category || !w.category.trim()) errors.push(`${label}: empty category`);
  }
  return errors;
}
