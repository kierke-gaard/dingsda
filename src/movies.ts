import { readFileSync, readdirSync } from 'node:fs';
import { artDir } from './paths.js';
import { parseMovies, validateMovie, type ArtLibrary, type Movie } from './movie.js';

export const WORD_FRAMES = 3;
export const INTRO_FRAMES = 5;

function readMovies(rel: string): Movie[] {
  return parseMovies(readFileSync(new URL(rel, artDir), 'utf8'), `data/art/${rel}`);
}

export function loadArtChecked(): { lib: ArtLibrary; errors: string[] } {
  const errors: string[] = [];
  const lib: ArtLibrary = { words: new Map(), categories: new Map() };
  const check = (rel: string, frames: number, into: Map<string, Movie> | undefined): Movie[] => {
    let movies: Movie[];
    try { movies = readMovies(rel); } catch (e) { errors.push((e as Error).message); return []; }
    for (const m of movies) {
      errors.push(...validateMovie(m, frames).map((x) => `${rel}: ${x}`));
      if (into) {
        if (into.has(m.id)) errors.push(`${rel}: duplicate movie ${m.id}`);
        into.set(m.id, m);
      }
    }
    return movies;
  };
  check('categories.txt', WORD_FRAMES, lib.categories);
  lib.intro = check('intro.txt', INTRO_FRAMES, undefined)[0];
  lib.outro = check('outro.txt', INTRO_FRAMES, undefined)[0];
  for (const f of readdirSync(new URL('words/', artDir)).filter((n) => n.endsWith('.txt')).sort()) {
    check(`words/${f}`, WORD_FRAMES, lib.words);
  }
  return { lib, errors };
}

export function loadArt(): ArtLibrary {
  const { lib, errors } = loadArtChecked();
  if (errors.length > 0) {
    console.error('Die Kunstdateien sind fehlerhaft:\n' + errors.join('\n'));
    process.exit(1);
  }
  return lib;
}
