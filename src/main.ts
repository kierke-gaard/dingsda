#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { audioDir, wordsDir } from './paths.js';
import { audioIsEmpty, runSetup } from './setup.js';
import { SilentSpeaker, WavSpeaker, findPlayer, piperAvailable, synthesize } from './speech.js';
import { loadArt } from './movies.js';
import { runGame } from './ui.js';
import { parseArgs, type Args } from './args.js';
import { MemorySeenWords, StaticWordSource, toAgeClass, validateWordList, type Word } from './words.js';

const HELP = `Dingsda – Wörter erklären für kleine Kinder

Benutzung:
  dingsda              Spiel starten (fragt nach dem Alter)
  dingsda --age N      Spiel für Alter N (3–6) starten
  dingsda setup        Einmalig: Piper + Stimme laden, Audio erzeugen
  dingsda --test-audio Ton testen
  dingsda --silent     Ohne Ton; das Wort steht auf stderr (zum Entwickeln)
  dingsda --help       Diese Hilfe
`;

export function loadWords(): Word[] {
  const words = [3, 4, 5, 6].flatMap((age) =>
    JSON.parse(readFileSync(new URL(`age${age}.json`, wordsDir), 'utf8')) as Word[]);
  const errors = validateWordList(words);
  if (errors.length > 0) {
    console.error('Die Wortliste ist fehlerhaft:\n' + errors.join('\n'));
    process.exit(1);
  }
  return words;
}

async function askAge(): Promise<number> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (;;) {
      const n = Number((await rl.question('Wie alt ist das Kind? (3–6): ')).trim().replace(',', '.'));
      if (Number.isFinite(n) && n > 0) return n;
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  let args: Args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error((e as Error).message + '\n\n' + HELP);
    process.exit(2);
  }
  if (args.help) { console.log(HELP); return; }
  const words = loadWords();
  const art = loadArt();

  if (args.setup) { await runSetup(words); return; }

  if (args.testAudio) {
    const player = findPlayer();
    if (!player) { console.error('Kein Audio-Player gefunden (pw-play, paplay oder aplay)'); process.exit(1); }
    if (!piperAvailable()) { console.error('Piper fehlt – bitte zuerst `dingsda setup` ausführen'); process.exit(1); }
    const file = join(audioDir, '_test.wav');
    if (!existsSync(file)) await synthesize('Hallo! Kannst du mich hören?', file);
    await new WavSpeaker(player).play(file);
    console.log('Kam der Ton nur aus dem Kopfhörer? Wenn nicht: Standard-Ausgabegerät umstellen.');
    return;
  }

  let speaker;
  if (args.silent) speaker = new SilentSpeaker();
  else {
    const player = findPlayer();
    if (!player) { console.error('Kein Audio-Player gefunden (pw-play, paplay oder aplay)'); process.exit(1); }
    if (audioIsEmpty()) { console.error('Kein Audio vorhanden – bitte zuerst `dingsda setup` ausführen'); process.exit(1); }
    speaker = new WavSpeaker(player);
  }

  const rawAge = args.age ?? (await askAge());
  const age = toAgeClass(rawAge);
  if (age !== Math.floor(rawAge)) {
    console.log(rawAge < 3 ? 'Unter 3 Jahren gibt es (noch) die Wörter für 3-Jährige.'
      : 'Ab 6 Jahren gibt es (noch) die Wörter für 6-Jährige.');
  }
  const source = new StaticWordSource(words, age, new MemorySeenWords());
  await runGame({ age, source, speaker, art });
}

main().catch((e) => { console.error((e as Error).message); process.exit(1); });
