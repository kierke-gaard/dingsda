import { homedir } from 'node:os';
import { join } from 'node:path';

export const dataDir = join(process.env.XDG_DATA_HOME || join(homedir(), '.local', 'share'), 'dingsda');
export const piperDir = join(dataDir, 'piper');
export const piperBinary = join(piperDir, 'piper', 'piper');
export const voiceModel = join(dataDir, 'voices', 'de_DE-thorsten-medium.onnx');
export const voiceConfig = `${voiceModel}.json`;
export const audioDir = join(dataDir, 'audio');
export const wordsDir = new URL('../data/words/', import.meta.url);
export const artDir = new URL('../data/art/', import.meta.url);
