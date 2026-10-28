import readline from 'node:readline';
import { BYE_ART, HIT_ART, MISS_ART, SKIP_ART, TITLE_ART, pick } from './art.js';
import { handle, initialState, type Effect, type GameState, type Key, type Score } from './game.js';
import { frameAt, movieFor, movieWidth, renderFrame, type ArtLibrary, type Movie } from './movie.js';
import type { Speaker } from './speech.js';
import {
  clear, color, enterAltScreen, exitAltScreen, hideCursor, showCursor, visibleWidth,
} from './term.js';
import { spokenText, type AgeClass, type Word, type WordSource } from './words.js';

const LEGEND = 'LEERTASTE Wort/nochmal · ENTER gewusst · ENTF nicht gewusst · S überspringen · ESC beenden';

export interface View {
  state: GameState<Word>;
  age: AgeClass;
  art?: { kind: 'hit' | 'miss' | 'skip'; lines: string[] };
  reveal?: Word;
  movie?: { movie: Movie; startedAt: number; frame: number };
  intro?: { movie: Movie; frame: number };
  outro?: { movie: Movie; frame: number };
  message?: string;
  warning?: string;
  ended?: boolean;
}

export function center(line: string, cols: number): string {
  const pad = Math.max(0, Math.floor((cols - visibleWidth(line)) / 2));
  return ' '.repeat(pad) + line;
}

/** Two vertical bar columns, `height` bar rows plus label and count rows. */
export function renderScore(score: Score, cols: number, height: number): string[] {
  const colW = Math.floor(cols / 2);
  const per = Math.max(1, Math.ceil(Math.max(score.hits, score.misses) / height));
  const bars = (n: number): number => Math.ceil(n / per);
  const cell = (n: number, row: number, style: 'green' | 'red'): string => {
    const filled = bars(n) >= height - row; // row 0 is the top
    const text = filled ? '███' : '   ';
    return center(filled ? color(text, style) : text, colW) + ' '.repeat(0);
  };
  const out: string[] = [];
  const pad = (s: string): string => s + ' '.repeat(Math.max(0, colW - visibleWidth(s)));
  for (let r = 0; r < height; r++) out.push(pad(cell(score.hits, r, 'green')) + cell(score.misses, r, 'red'));
  const label = (t: string, style: 'green' | 'red'): string => pad(center(color(t, ['bold', style]), colW));
  out.push(label('GEWUSST', 'green') + center(color('NICHT GEWUSST', ['bold', 'red']), colW));
  const count = (n: number): string => `${n}` + (per > 1 ? ` (1 Block = ${per})` : '');
  out.push(pad(center(count(score.hits), colW)) + center(count(score.misses), colW));
  return out;
}

/** Puts two blocks next to each other, each centred in its half of the screen. */
export function sideBySide(left: string[], right: string[], cols: number): string[] {
  const lw = Math.max(0, ...left.map(visibleWidth));
  const rw = Math.max(0, ...right.map(visibleWidth));
  const half = Math.floor(cols / 2);
  const lStart = Math.max(0, Math.floor((half - lw) / 2));
  const rStart = Math.max(lStart + lw + 2, half + Math.floor((cols - half - rw) / 2));
  const pad = (n: number): string => ' '.repeat(Math.max(0, n));
  const out: string[] = [];
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const l = left[i] ?? '';
    out.push(pad(lStart) + l + pad(rStart - lStart - visibleWidth(l)) + (right[i] ?? ''));
  }
  return out;
}

export function renderLines(view: View, cols: number, rows: number): string[] {
  const { state } = view;
  const compact = cols < 40 || rows < 20;
  const lines: string[] = [];
  const title = `${color('DINGSDA', ['bold', 'cyan'])}   Alter: ${view.age}`;
  lines.push(center(title, cols), '');

  const main: string[] = [];
  const art = view.art;
  const anim = view.intro ?? view.outro;
  const movieShown = !compact && !view.ended && !anim && (state.phase === 'result' || state.phase === 'active') && view.movie !== undefined;
  const showArt = !compact && art !== undefined && state.phase !== 'confirmQuit';
  if (anim) {
    if (!compact) {
      const m = anim.movie;
      main.push(...renderFrame(m.frames[anim.frame] ?? m.frames[m.frames.length - 1]!, movieWidth(m))
        .map((l) => center(l, cols)));
    }
  } else if (view.ended) {
    if (!compact) main.push(...BYE_ART.map((l) => center(color(l, 'cyan'), cols)), '');
    main.push(center(view.message ?? 'Tschüss!', cols));
    main.push(center(`Gewusst: ${state.score.hits}   Nicht gewusst: ${state.score.misses}`, cols), '');
    main.push(center(color('Taste drücken zum Beenden', 'dim'), cols));
  } else {
    switch (state.phase) {
      case 'ready':
        if (showArt && art!.kind === 'skip') main.push(...art!.lines.map((l) => center(color(l, 'yellow'), cols)), '');
        else if (!compact && state.score.hits + state.score.misses + state.score.skips === 0) {
          main.push(...TITLE_ART.map((l) => center(color(l, 'cyan'), cols)), '');
        }
        main.push(center(color('Drück die LEERTASTE für dein Wort!', 'bold'), cols));
        break;
      case 'active':
        if (movieShown) {
          const m = view.movie!.movie;
          main.push(...renderFrame(m.frames[view.movie!.frame] ?? m.frames[m.frames.length - 1]!, movieWidth(m))
            .map((l) => center(l, cols)), '');
        }
        main.push(center(color('Erklär das Wort!', 'bold'), cols));
        main.push(center(color('(LEERTASTE = nochmal hören)', 'dim'), cols));
        break;
      case 'result': {
        const verdict = art?.kind === 'hit' ? 'green' : 'red';
        if (movieShown) {
          const m = view.movie!.movie;
          const f = renderFrame(m.frames[view.movie!.frame] ?? m.frames[m.frames.length - 1]!, movieWidth(m));
          if (showArt && art!.kind !== 'skip' && cols >= 76) {
            main.push(...sideBySide(art!.lines.map((l) => color(l, verdict)), f, cols));
          } else {
            const text = art?.kind === 'hit' ? 'SUPER!' : 'Oh nein!';
            if (art && art.kind !== 'skip') main.push(center(color(text, ['bold', verdict]), cols));
            main.push(...f.map((l) => center(l, cols)));
          }
          main.push('');
        } else if (showArt && art!.kind !== 'skip') {
          main.push(...art!.lines.map((l) => center(color(l, verdict), cols)), '');
        }
        if (view.reveal) {
          main.push(center(color(`Das Wort war: ${spokenText(view.reveal)}`, ['bold', 'yellow']), cols));
        }
        main.push(center(color(cols >= 50 ? 'W = nochmal ansehen · LEERTASTE = nächstes Wort' : 'LEERTASTE = nächstes Wort', 'dim'), cols));
        break;
      }
      case 'confirmQuit':
        main.push(center(color('Wirklich beenden? (j/n)', ['bold', 'yellow']), cols));
        break;
      case 'finished':
        break;
    }
    if (view.warning) main.push('', center(color(view.warning, 'yellow'), cols));
  }

  let scoreLines: string[];
  if (anim) {
    scoreLines = [];
  } else if (compact) {
    scoreLines = [center(`${color('GEWUSST', 'green')} ${state.score.hits} | ${color('NICHT GEWUSST', 'red')} ${state.score.misses}`, cols)];
  } else {
    scoreLines = renderScore(state.score, cols, Math.max(3, Math.min(8, rows - 20 + 6) - (movieShown ? 2 : 0)));
  }
  const legend = compact || anim ? [] : [center(color(LEGEND.slice(0, cols), 'dim'), cols)];

  const free = rows - lines.length - scoreLines.length - legend.length;
  // If the main area doesn't fit, drop leading art lines (keeps the text at the bottom).
  const mainFit = main.length > free ? main.slice(main.length - Math.max(0, free)) : main;
  const topPad = Math.max(0, Math.floor((free - mainFit.length) / 2));
  const bottomPad = Math.max(0, free - mainFit.length - topPad);
  return [...lines, ...Array(topPad).fill(''), ...mainFit, ...Array(bottomPad).fill(''), ...scoreLines, ...legend];
}

export function mapKey(str: string | undefined, key: readline.Key | undefined): Key | 'exit' | undefined {
  if (key?.ctrl && key.name === 'c') return 'exit';
  switch (key?.name) {
    case 'space': return 'space';
    case 'return':
    case 'enter': return 'enter';
    case 'delete':
    case 'backspace': return 'miss';
    case 'right': return 'skip';
    case 'escape': return 'escape';
  }
  if (key?.ctrl || key?.meta) return undefined;
  if (str === ' ') return 'space';
  switch (str?.toLowerCase()) {
    case 's': return 'skip';
    case 'w': return 'replay';
    case 'j':
    case 'y': return 'yes';
    case 'n': return 'no';
  }
  return undefined;
}

export interface GameOptions { age: AgeClass; source: WordSource; speaker: Speaker; art?: ArtLibrary }

export function runGame(opts: GameOptions): Promise<void> {
  const { stdin, stdout } = process;
  return new Promise((resolve) => {
    let state: GameState<Word> = initialState<Word>();
    const view: View = { state, age: opts.age };
    let restored = false;
    let timer: NodeJS.Timeout | undefined;
    const compactNow = (): boolean => (stdout.columns || 80) < 40 || (stdout.rows || 24) < 20;

    const stopTimer = (): void => { if (timer) clearTimeout(timer); timer = undefined; };
    const stopMovie = (): void => { stopTimer(); view.movie = undefined; };

    const restore = (): void => {
      if (restored) return;
      restored = true;
      stopTimer();
      opts.speaker.stop();
      try { if (stdin.isTTY) stdin.setRawMode(false); } catch { /* ignore */ }
      stdout.write(showCursor() + exitAltScreen());
    };
    const onSignal = (): void => { restore(); process.exit(130); };
    const onCrash = (err: unknown): void => {
      restore();
      console.error(err);
      process.exit(1);
    };
    process.on('exit', restore);
    process.on('SIGINT', onSignal);
    process.on('SIGTERM', onSignal);
    process.on('uncaughtException', onCrash);

    const draw = (): void => {
      const cols = stdout.columns || 80;
      const rows = stdout.rows || 24;
      view.state = state;
      stdout.write(clear() + renderLines(view, cols, rows).slice(0, rows).join('\n'));
    };

    /** Shows frame 0 now and one further frame per `frameMs`; calls `onDone` after the last frame. */
    const play = (
      movie: Movie, frameMs: number, set: (frame: number) => void, onDone?: () => void,
    ): void => {
      stopTimer();
      const startedAt = Date.now();
      set(0);
      draw();
      const tick = (): void => {
        const frame = frameAt(Date.now() - startedAt + 50, movie.frames.length, frameMs);
        set(frame);
        draw();
        if (frame < movie.frames.length - 1) {
          timer = setTimeout(tick, frameMs);
        } else {
          timer = undefined;
          onDone?.();
        }
      };
      timer = setTimeout(tick, frameMs);
    };

    const startMovie = (movie: Movie): void => {
      view.movie = { movie, startedAt: Date.now(), frame: 0 };
      play(movie, 1000, (frame) => { if (view.movie) view.movie.frame = frame; });
    };

    /** Plays intro/outro; `then` runs when it ends or is skipped. Returns false if nothing plays. */
    let endAnim: (() => void) | undefined;
    const playAnim = (kind: 'intro' | 'outro', movie: Movie | undefined, then: () => void): boolean => {
      if (!movie || compactNow()) return false;
      const done = (): void => {
        stopTimer();
        view[kind] = undefined;
        endAnim = undefined;
        then();
      };
      endAnim = done;
      view[kind] = { movie, frame: 0 };
      play(movie, 1000, (frame) => { if (view[kind]) view[kind]!.frame = frame; }, () => {
        timer = setTimeout(done, 1000);
      });
      return true;
    };

    const finish = (): void => {
      process.off('exit', restore);
      process.off('SIGINT', onSignal);
      process.off('SIGTERM', onSignal);
      process.off('uncaughtException', onCrash);
      stdin.off('keypress', onKey);
      stdout.off('resize', draw);
      restore();
      stdin.pause();
      resolve();
    };

    const endGame = (message: string): void => {
      stopMovie();
      view.message = message;
      view.ended = true;
      playAnim('outro', opts.art?.outro, () => draw());
    };

    const apply = (effects: Effect<Word>[]): void => {
      for (const e of effects) {
        switch (e.type) {
          case 'speak':
            view.warning = undefined;
            opts.speaker.stop();
            opts.speaker.say(spokenText(e.word), e.word.id).catch((err: Error) => {
              view.warning = err.message;
              draw();
            });
            break;
          case 'art':
            view.art = {
              kind: e.kind,
              lines: e.kind === 'hit' ? pick(HIT_ART) : e.kind === 'miss' ? pick(MISS_ART) : SKIP_ART,
            };
            if (e.kind === 'skip') view.reveal = undefined;
            break;
          case 'reveal':
            opts.speaker.stop();
            view.reveal = e.word;
            break;
          case 'movie': {
            const m = opts.art && movieFor(e.word, opts.art);
            if (m) startMovie(m);
            break;
          }
          case 'noWordsLeft':
            endGame('Keine Wörter mehr – toll gespielt!');
            break;
          case 'quit':
            endGame('Tschüss!');
            break;
        }
      }
    };

    function onKey(str: string | undefined, key: readline.Key | undefined): void {
      const k = mapKey(str, key);
      if (k === 'exit') { restore(); process.exit(130); }
      if (endAnim) { endAnim(); draw(); return; }
      if (view.ended) { finish(); return; }
      if (k === undefined) return;
      const r = handle(state, k, () => opts.source.next(), Date.now());
      state = r.state;
      if (state.phase === 'active') { view.art = undefined; view.reveal = undefined; stopMovie(); }
      if (state.phase === 'ready') stopMovie();
      apply(r.effects);
      draw();
    }

    readline.emitKeypressEvents(stdin);
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdout.write(enterAltScreen() + hideCursor());
    stdin.on('keypress', onKey);
    stdout.on('resize', draw);
    if (!playAnim('intro', opts.art?.intro, () => draw())) draw();
  });
}
