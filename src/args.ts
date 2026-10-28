export interface Args { setup: boolean; testAudio: boolean; silent: boolean; help: boolean; age?: number }

export function parseArgs(argv: string[]): Args {
  const a: Args = { setup: false, testAudio: false, silent: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === 'setup') a.setup = true;
    else if (arg === '--test-audio') a.testAudio = true;
    else if (arg === '--silent') a.silent = true;
    else if (arg === '--help' || arg === '-h') a.help = true;
    else if (arg === '--age') {
      const n = Number(argv[++i]);
      if (!Number.isFinite(n)) throw new Error('--age braucht eine Zahl');
      a.age = n;
    } else if (arg.startsWith('--age=')) {
      const n = Number(arg.slice(6));
      if (!Number.isFinite(n)) throw new Error('--age braucht eine Zahl');
      a.age = n;
    } else throw new Error(`Unbekanntes Argument: ${arg}`);
  }
  return a;
}
