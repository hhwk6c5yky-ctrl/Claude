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
  ind: '_{|}',
  exp: '^{|}',
  exxp: '^{|}',
};

/** Indice et exposant : collés au mot, au nombre ou à la formule qui précède. */
const ATTACHED = new Set(['ind', 'exp', 'exxp']);

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
  if (ATTACHED.has(key)) {
    const attached = attach(text, wordStart, caret, MATH_KEYWORDS[key]);
    if (attached) return attached;
  }
  const inMath = Boolean(rangeAt(text, wordStart));
  let snippet = MATH_KEYWORDS[key];
  if (!inMath) snippet = `$${snippet}$`;
  const pos = snippet.indexOf('|');
  const clean = snippet.replace('|', '');
  return { text: text.slice(0, wordStart) + clean + text.slice(caret), caret: wordStart + pos, from: wordStart, to: caret, insert: clean };
}

// « u ind » → u_{…} ; « x exp » → x^{…} ; « $x$ exp » → $x^{…}$.
function attach(text, wordStart, caret, snippet) {
  const head = text.slice(0, wordStart).replace(/ $/, ''); // une espace entre la base et le mot-clé
  const pos = snippet.indexOf('|');
  const clean = snippet.replace('|', '');
  const done = (from, insert, caretAt) => ({ text: text.slice(0, from) + insert + text.slice(caret), caret: caretAt, from, to: caret, insert });

  // Juste après une formule : on ajoute dedans, avant le $ fermant.
  const closing = mathRanges(head).find((r) => r.to === head.length);
  if (closing) {
    const inner = head.slice(closing.from, closing.end) + clean + head.slice(closing.end, closing.to);
    return done(closing.from, inner, closing.end + pos);
  }
  const baseStart = baseStartOf(head);
  if (baseStart < 0) return null;
  const m = [null, head.slice(baseStart)];
  if (rangeAt(text, baseStart)) {
    // Déjà dans une formule : on colle à la base (sans l'espace).
    return done(head.length, clean, head.length + pos);
  }
  // Texte normal : la base et son indice/exposant forment une nouvelle formule.
  return done(baseStart, `$${m[1]}${clean}$`, baseStart + 1 + m[1].length + pos);
}

// Début de la « base » qui termine `head` : un mot ou nombre (u, x2, 10), ou un
// groupe entre parenthèses avec ce qui le précède (f(x), (a+b), \vec{u}). -1 si aucune.
function baseStartOf(head) {
  let i = head.length;
  const close = { ')': '(', ']': '[', '}': '{' };
  if (close[head[i - 1]]) {
    let depth = 0;
    for (i -= 1; i >= 0; i--) {
      if (close[head[i]]) depth++;
      else if (Object.values(close).includes(head[i]) && --depth === 0) break;
    }
    if (i < 0) return -1;
  }
  while (i > 0 && /[A-Za-z0-9\\]/.test(head[i - 1])) i--;
  return i < head.length ? i : -1;
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
