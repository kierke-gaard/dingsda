import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { audioDir, piperBinary, voiceModel } from './paths.js';

export interface Speaker { say(text: string, id: string): Promise<void>; stop(): void }

export class SilentSpeaker implements Speaker {
  say(text: string): Promise<void> {
    process.stderr.write(`[WORT] ${text}\n`);
    return Promise.resolve();
  }
  stop(): void {}
}

export function findPlayer(): string[] | undefined {
  for (const name of ['pw-play', 'paplay', 'aplay']) {
    if (spawnSync('sh', ['-c', `command -v ${name}`], { stdio: 'ignore' }).status === 0) {
      return name === 'aplay' ? [name, '-q'] : [name];
    }
  }
  return undefined;
}

export function piperAvailable(): boolean {
  return existsSync(piperBinary) && existsSync(voiceModel);
}

/** Synthesizes `text` into `file` (via a .part file) using Piper. */
export function synthesize(text: string, file: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const part = `${file}.part`;
    const p = spawn(piperBinary, ['--model', voiceModel, '--length_scale', '1.2', '--output_file', part], {
      cwd: dirname(piperBinary),
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    p.on('error', reject);
    p.on('close', (code) => {
      if (code === 0 && existsSync(part)) {
        renameSync(part, file);
        resolve();
      } else {
        reject(new Error(`Piper ist mit Code ${code} beendet`));
      }
    });
    p.stdin.on('error', () => {});
    p.stdin.end(`${text}\n`);
  });
}

export class WavSpeaker implements Speaker {
  private child?: ChildProcess;
  private token = 0;

  constructor(private player: string[]) {}

  async say(text: string, id: string): Promise<void> {
    const my = ++this.token;
    const file = join(audioDir, `${id}.wav`);
    if (!existsSync(file)) {
      if (!piperAvailable()) throw new Error('Audio fehlt – bitte zuerst `dingsda setup` ausführen');
      await synthesize(text, file);
    }
    if (my !== this.token) return; // superseded while synthesizing
    await this.play(file);
  }

  play(file: string): Promise<void> {
    return new Promise((resolve) => {
      const [cmd, ...args] = this.player;
      const c = spawn(cmd!, [...args, file], { stdio: 'ignore' });
      this.child = c;
      c.on('error', () => resolve());
      c.on('close', () => resolve());
    });
  }

  stop(): void {
    this.token++;
    this.child?.kill();
    this.child = undefined;
  }
}
