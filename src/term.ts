import { styleText } from 'node:util';

export const enterAltScreen = (): string => '\x1b[?1049h';
export const exitAltScreen = (): string => '\x1b[?1049l';
export const hideCursor = (): string => '\x1b[?25l';
export const showCursor = (): string => '\x1b[?25h';
export const clear = (): string => '\x1b[2J\x1b[H';
export const moveTo = (row: number, col: number): string => `\x1b[${row};${col}H`;

export type Style =
  | 'green' | 'red' | 'yellow' | 'cyan' | 'blue' | 'magenta' | 'white' | 'gray'
  | 'redBright' | 'greenBright' | 'yellowBright' | 'blueBright' | 'magentaBright' | 'cyanBright' | 'whiteBright'
  | 'bold' | 'dim';
export function color(text: string, style: Style | Style[]): string {
  return styleText(style, text, { validateStream: false });
}

// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?]*[A-Za-z]/g;
export function stripAnsi(s: string): string {
  return s.replace(ANSI, '');
}
export function visibleWidth(s: string): number {
  return [...stripAnsi(s)].length;
}
