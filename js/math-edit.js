// Aides à la saisie des formules dans l'éditeur de cartes (fonctions pures).
//
// - Mots-clés : « sum », « frac », « vect »… suivis d'Espace (ou Tab) deviennent
//   la formule correspondante, curseur dans la première case.
// - Tab passe à la case vide suivante ({}) de la formule, puis sort de la formule.
//   Maj+Tab revient à la case vide précédente.
import { mathRanges } from './math.js';

/** Mot-clé → formule ; « | » marque la place du curseur. */
export const MATH_KEYWORDS = {
  sum: '\\sum_{|}^{}',
  prod: '\\prod_{|}^{}',
  int: '\\int_{|}^{}',
  lim: '\\lim_{|}',
  frac: '\\frac{|}{}',
  sqrt: '\\sqrt{|}',
  vect: '\\vec{|}',
  vec: '\\vec{|}',
};

function rangeAt(text, caret) {
  return mathRanges(text).find((r) => caret >= r.start && caret <= r.end) || null;
}

/**
 * Remplace le mot-clé qui précède le curseur.
 * @returns {{text: string, caret: number} | null}
 */
export function expandKeyword(text, caret) {
  const before = text.slice(0, caret);
  const m = /(^|[^A-Za-z\\])([A-Za-z]+)$/.exec(before);
  if (!m) return null;
  const word = m[2];
  const key = word.toLowerCase();
  // « sum » ou « Sum » (majuscule automatique du téléphone), mais pas « SUM ».
  if (!MATH_KEYWORDS[key] || (word !== key && word !== key[0].toUpperCase() + key.slice(1))) return null;
  const wordStart = caret - word.length;
  const inMath = Boolean(rangeAt(text, wordStart));
  let snippet = MATH_KEYWORDS[key];
  if (!inMath) snippet = `$${snippet}$`;
  const pos = snippet.indexOf('|');
  const clean = snippet.replace('|', '');
  return { text: text.slice(0, wordStart) + clean + text.slice(caret), caret: wordStart + pos, from: wordStart, to: caret, insert: clean };
}

/** Case vide suivante, ou juste après la formule. null si le curseur n'est pas dans une formule. */
export function nextBox(text, caret) {
  const r = rangeAt(text, caret);
  if (!r) return null;
  const i = text.indexOf('{}', caret);
  if (i >= 0 && i + 1 <= r.end) return i + 1;
  return r.to;
}

/** Case vide précédente dans la même formule, ou null. */
export function prevBox(text, caret) {
  const r = rangeAt(text, caret);
  if (!r) return null;
  const i = text.lastIndexOf('{}', caret - 2);
  return i >= r.start ? i + 1 : null;
}
