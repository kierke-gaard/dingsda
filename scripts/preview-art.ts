// Development tool: npx tsx scripts/preview-art.ts <id|category|--all|--coverage> [--animate]
import { readFileSync } from 'node:fs';
import { loadArtChecked } from '../src/movies.js';
import { movieWidth, renderFrame, type Movie } from '../src/movie.js';
import { slugify, type Word } from '../src/words.js';

const args = process.argv.slice(2);
const animate = args.includes('--animate');
const query = args.find((a) => !a.startsWith('--') || a === '--all' || a === '--coverage');
if (!query) {
  console.error('usage: preview-art.ts <id|category|--all|--coverage> [--animate]');
  process.exit(2);
}

const { lib, errors } = loadArtChecked();
if (errors.length > 0) console.error('ERRORS:\n' + errors.join('\n') + '\n');

const words: Word[] = [3, 4, 5, 6].flatMap((age) =>
  JSON.parse(readFileSync(new URL(`../data/words/age${age}.json`, import.meta.url), 'utf8')) as Word[]);

function show(m: Movie, title: string): void {
  const w = movieWidth(m);
  const frames = m.frames.map((f) => renderFrame(f, w));
  const h = Math.max(...frames.map((f) => f.length));
  console.log(`\n== ${title} ==`);
  for (let i = 0; i < h; i++) {
    console.log(frames.map((f) => f[i] ?? ' '.repeat(w)).join('  |  '));
  }
}

async function play(m: Movie, title: string): Promise<void> {
  const w = movieWidth(m);
  for (const f of m.frames) {
    console.clear();
    console.log(title + '\n');
    console.log(renderFrame(f, w).join('\n'));
    await new Promise((r) => setTimeout(r, 1000));
  }
}

if (query === '--coverage') {
  const cats = [...new Set(words.map((w) => w.category))].sort();
  let total = 0;
  for (const c of cats) {
    const ws = words.filter((w) => w.category === c);
    const own = ws.filter((w) => lib.words.has(w.id));
    total += own.length;
    const missing = ws.filter((w) => !lib.words.has(w.id)).map((w) => w.id);
    console.log(`${c}: ${ws.length} words, ${own.length} own movies, category movie: ${lib.categories.has(c) ? 'yes' : 'NO'}`);
    if (process.argv.includes('--missing')) console.log('  missing: ' + missing.join(', '));
  }
  console.log(`\ntotal word movies: ${total}`);
} else {
  const entries: [string, Movie][] = [];
  if (query === '--all') {
    for (const [k, m] of lib.categories) entries.push([`category ${k}`, m]);
    if (lib.intro) entries.push(['intro', lib.intro]);
    if (lib.outro) entries.push(['outro', lib.outro]);
    for (const [k, m] of lib.words) entries.push([`word ${k}`, m]);
  } else {
    const q = query;
    const cat = [...lib.categories.keys()].find((c) => c === q || slugify(c) === q);
    if (q === 'intro' && lib.intro) entries.push(['intro', lib.intro]);
    else if (q === 'outro' && lib.outro) entries.push(['outro', lib.outro]);
    else if (cat) {
      entries.push([`category ${cat}`, lib.categories.get(cat)!]);
      for (const w of words.filter((x) => x.category === cat && lib.words.has(x.id))) {
        entries.push([`word ${w.id}`, lib.words.get(w.id)!]);
      }
    } else if (lib.words.has(q)) entries.push([`word ${q}`, lib.words.get(q)!]);
    else { console.error(`nothing found for "${q}"`); process.exit(1); }
  }
  for (const [title, m] of entries) {
    if (animate) await play(m, title);
    else show(m, title + (title.startsWith('word ') ? ` (${words.find((w) => `word ${w.id}` === title)?.word ?? '?'})` : ''));
  }
}
