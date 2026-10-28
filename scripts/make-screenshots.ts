// Development tool: npx tsx scripts/make-screenshots.ts
// Renders real game screens (src/ui.ts) into terminal-style SVGs in docs/ for the README.
import { mkdirSync, writeFileSync } from 'node:fs';
import { HIT_ART, MISS_ART } from '../src/art.js';
import type { GameState } from '../src/game.js';
import { loadArt } from '../src/movies.js';
import { movieFor, type Movie } from '../src/movie.js';
import { renderLines, type View } from '../src/ui.js';
import type { Word } from '../src/words.js';

const COLS = 100;
const ROWS = 28;
const CW = 9.6;
const CH = 20;
const PAD = 18;
const BAR = 38;

const PALETTE: Record<number, string> = {
  30: '#45475a', 31: '#f38ba8', 32: '#a6e3a1', 33: '#f9e2af', 34: '#89b4fa', 35: '#cba6f7', 36: '#94e2d5', 37: '#cdd6f4',
  90: '#6c7086', 91: '#ff7a93', 92: '#b9f5b4', 93: '#ffeeb0', 94: '#a3c8ff', 95: '#e2c4ff', 96: '#aaf0e6', 97: '#ffffff',
};
const FG = '#cdd6f4';
const BG = '#1e1e2e';

const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Span { text: string; fg?: string; bold: boolean; dim: boolean }

function parseLine(line: string): Span[] {
  const spans: Span[] = [];
  let fg: string | undefined;
  let bold = false;
  let dim = false;
  const re = /\x1b\[([0-9;]*)m/g;
  let last = 0;
  const push = (t: string): void => { if (t) spans.push({ text: t, fg, bold, dim }); };
  for (let m = re.exec(line); m; m = re.exec(line)) {
    push(line.slice(last, m.index));
    last = re.lastIndex;
    for (const c of (m[1] || '0').split(';').map(Number)) {
      if (c === 0) { fg = undefined; bold = false; dim = false; }
      else if (c === 1) bold = true;
      else if (c === 2) dim = true;
      else if (c === 22) { bold = false; dim = false; }
      else if (c === 39) fg = undefined;
      else if (PALETTE[c]) fg = PALETTE[c];
    }
  }
  push(line.slice(last));
  return spans;
}

/** One screen as an SVG group (no window chrome). */
function screenGroup(lines: string[]): string {
  const rows = lines.map((line, i) => {
    const y = BAR + PAD + (i + 1) * CH - 5;
    const spans = parseLine(line).map((s) => {
      const attrs = [`fill="${s.fg ?? FG}"`];
      if (s.bold) attrs.push('font-weight="700"');
      if (s.dim) attrs.push('opacity="0.55"');
      return `<tspan ${attrs.join(' ')}>${esc(s.text)}</tspan>`;
    }).join('');
    return `<text x="${PAD}" y="${y}" xml:space="preserve">${spans}</text>`;
  });
  return rows.join('\n');
}

const W = Math.round(COLS * CW + PAD * 2);
const H = BAR + ROWS * CH + PAD * 2;

function chrome(title: string): string {
  return `<rect width="${W}" height="${H}" rx="12" fill="${BG}"/>
<path d="M0 12a12 12 0 0 1 12-12h${W - 24}a12 12 0 0 1 12 12v${BAR - 12}H0z" fill="#181825"/>
<circle cx="24" cy="${BAR / 2}" r="6.5" fill="#ff5f57"/><circle cx="46" cy="${BAR / 2}" r="6.5" fill="#febc2e"/><circle cx="68" cy="${BAR / 2}" r="6.5" fill="#28c840"/>
<text x="${W / 2}" y="${BAR / 2 + 5}" text-anchor="middle" fill="#6c7086" font-size="13">${esc(title)}</text>`;
}

function svg(body: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'DejaVu Sans Mono','Menlo','Consolas','Liberation Mono',monospace" font-size="16">
${chrome(title)}
${body}
</svg>
`;
}

// --- scenes -----------------------------------------------------------------

const lib = loadArt();
const word = (id: string, w: string, article: Word['article'], category: string): Word =>
  ({ id, word: w, article, age: 5, category });

const state = (phase: GameState<Word>['phase'], hits: number, misses: number, current?: Word): GameState<Word> =>
  ({ phase, score: { hits, misses, skips: 0 }, current });

const movieView = (w: Word, frame: number): NonNullable<View['movie']> =>
  ({ movie: movieFor(w, lib) as Movie, startedAt: 0, frame });

const elefant = word('elefant', 'Elefant', 'der', 'Tiere');
const torte = word('torte', 'Torte', 'die', 'Feste');
const bagger = word('bagger', 'Bagger', 'der', 'Fahrzeuge');

interface Scene { name: string; view: View }
const scenes: Scene[] = [
  { name: 'intro', view: { state: state('ready', 0, 0), age: 5, intro: { movie: lib.intro!, frame: 4 } } },
  { name: 'start', view: { state: state('ready', 0, 0), age: 5 } },
  { name: 'explain', view: { state: state('active', 2, 1, elefant), age: 5, movie: movieView(elefant, 2) } },
  {
    name: 'hit',
    view: {
      state: state('result', 3, 1, torte), age: 5, movie: movieView(torte, 2), reveal: torte,
      art: { kind: 'hit', lines: HIT_ART[0]! },
    },
  },
  {
    name: 'miss',
    view: {
      state: state('result', 3, 2, bagger), age: 5, movie: movieView(bagger, 2), reveal: bagger,
      art: { kind: 'miss', lines: MISS_ART[0]! },
    },
  },
  { name: 'outro', view: { state: state('ready', 5, 2), age: 5, ended: true, outro: { movie: lib.outro!, frame: 4 } } },
];

const render = (v: View): string[] => renderLines(v, COLS, ROWS).slice(0, ROWS);

mkdirSync(new URL('../docs/', import.meta.url), { recursive: true });
const out = (name: string, content: string): void =>
  writeFileSync(new URL(`../docs/${name}`, import.meta.url), content);

for (const s of scenes) out(`${s.name}.svg`, svg(screenGroup(render(s.view)), 'dingsda'));

// Animated demo: a whole round, frame by frame.
const demo: { view: View; secs: number }[] = [
  { view: scenes[0]!.view, secs: 2 },
  { view: scenes[1]!.view, secs: 2.5 },
  ...[0, 1, 2].map((f) => ({ view: { ...scenes[2]!.view, movie: movieView(elefant, f) }, secs: 1 })),
  { view: { ...scenes[2]!.view, movie: movieView(elefant, 2) }, secs: 1.5 },
  { view: scenes[3]!.view, secs: 3.5 },
  { view: { ...scenes[1]!.view, state: state('ready', 3, 1) }, secs: 1.5 },
  ...[0, 1, 2].map((f) => ({ view: { ...scenes[4]!.view, state: state('active', 3, 1, bagger), movie: movieView(bagger, f), art: undefined, reveal: undefined }, secs: 1 })),
  { view: scenes[4]!.view, secs: 3.5 },
  { view: scenes[5]!.view, secs: 3 },
];
const total = demo.reduce((a, d) => a + d.secs, 0);
let t = 0;
const groups = demo.map((d) => {
  const start = t / total;
  t += d.secs;
  const end = t / total;
  const kt = [0, start, start + 1e-6, end, Math.min(1, end + 1e-6), 1];
  const vals = ['0', '0', '1', '1', '0', '0'];
  return `<g opacity="0"><animate attributeName="opacity" dur="${total}s" repeatCount="indefinite" calcMode="discrete" keyTimes="${kt.join(';')}" values="${vals.join(';')}"/>
${screenGroup(render(d.view))}
</g>`;
});
out('demo.svg', svg(groups.join('\n'), 'dingsda'));
console.log(`wrote ${scenes.length} screens + demo.svg (${total}s) to docs/`);
