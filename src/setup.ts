import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { audioDir, dataDir, piperBinary, piperDir, voiceConfig, voiceModel } from './paths.js';
import { synthesize } from './speech.js';
import { spokenText, type Word } from './words.js';
import { dirname, join } from 'node:path';

const PIPER_BASE = 'https://github.com/rhasspy/piper/releases/download/2023.11.14-2/';
const VOICE_BASE = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/de/de_DE/thorsten/medium/';

async function download(url: string, dest: string): Promise<void> {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok || !res.body) throw new Error(`Download fehlgeschlagen (${res.status}): ${url}`);
  const total = Number(res.headers.get('content-length') ?? 0);
  const part = `${dest}.part`;
  let got = 0;
  let lastPrint = 0;
  const body = Readable.fromWeb(res.body as never);
  body.on('data', (chunk: Buffer) => {
    got += chunk.length;
    if (Date.now() - lastPrint > 250) {
      lastPrint = Date.now();
      const mb = (got / 1e6).toFixed(1);
      process.stdout.write(`\r  ${mb}${total ? ` / ${(total / 1e6).toFixed(1)}` : ''} MB`);
    }
  });
  await pipeline(body, createWriteStream(part));
  process.stdout.write(`\r  ${(got / 1e6).toFixed(1)} MB – fertig\n`);
  renameSync(part, dest);
}

function extract(tarball: string, into: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['-xzf', tarball, '-C', into], { stdio: 'inherit' });
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`tar fehlgeschlagen (${code})`))));
  });
}

export async function renderAll(words: Word[], parallel = 4): Promise<void> {
  const todo = words.filter((w) => !existsSync(join(audioDir, `${w.id}.wav`)));
  let done = 0;
  let idx = 0;
  const worker = async (): Promise<void> => {
    while (idx < todo.length) {
      const w = todo[idx++]!;
      await synthesize(spokenText(w), join(audioDir, `${w.id}.wav`));
      process.stdout.write(`\r  ${++done}/${todo.length}`);
    }
  };
  if (todo.length === 0) { console.log('Alle Wörter sind schon vorbereitet.'); return; }
  await Promise.all(Array.from({ length: Math.min(parallel, todo.length) }, worker));
  process.stdout.write('\n');
}

export async function runSetup(words: Word[]): Promise<void> {
  mkdirSync(piperDir, { recursive: true });
  mkdirSync(dirname(voiceModel), { recursive: true });
  mkdirSync(audioDir, { recursive: true });
  console.log(`Datenordner: ${dataDir}`);

  if (!existsSync(piperBinary)) {
    const file = process.arch === 'x64' ? 'piper_linux_x86_64.tar.gz'
      : process.arch === 'arm64' ? 'piper_linux_aarch64.tar.gz' : undefined;
    if (!file) throw new Error(`Nicht unterstützte Architektur: ${process.arch}`);
    console.log('Lade Piper herunter …');
    const tarball = join(piperDir, file);
    await download(PIPER_BASE + file, tarball);
    await extract(tarball, piperDir);
  }
  for (const [path, name] of [[voiceModel, 'de_DE-thorsten-medium.onnx'], [voiceConfig, 'de_DE-thorsten-medium.onnx.json']] as const) {
    if (!existsSync(path)) {
      console.log(`Lade Stimme herunter: ${name}`);
      await download(VOICE_BASE + name, path);
    }
  }
  console.log('Erzeuge Audio für alle Wörter …');
  await renderAll(words);
  console.log('Fertig. Teste den Ton mit: dingsda --test-audio');
}

export function audioIsEmpty(): boolean {
  return !existsSync(audioDir) || readdirSync(audioDir).filter((f) => f.endsWith('.wav')).length === 0;
}
