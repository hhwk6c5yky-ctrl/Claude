// Vérification d'une réponse tapée au clavier (mode « Écrire la réponse »).
import { mathToPlain } from './math.js';

function base(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/^[\s.,;:!?«»"()]+|[\s.,;:!?«»"()]+$/g, '')
    .trim();
}

function stripAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/**
 * Compare la réponse tapée à la réponse attendue.
 * Plusieurs réponses acceptées peuvent être séparées par « / » ou « ; » dans la carte.
 * @returns {'correct'|'close'|'wrong'}
 *   close = bonne réponse à un accent ou une faute de frappe près
 */
export function checkAnswer(typed, expected) {
  const t = base(typed);
  if (!t) return 'wrong';
  // Une réponse avec formule ($\alpha$) est aussi acceptée tapée en symboles (α).
  const raw = String(expected ?? '');
  const variants = [...new Set([raw, raw.replace(/\$/g, ''), mathToPlain(raw)])].map(base);
  const options = variants.flatMap((v) => [v, ...v.split(/\s*[/;]\s*|\n/).map(base)]).filter(Boolean);
  if (options.includes(t)) return 'correct';
  const ta = stripAccents(t);
  for (const o of options) {
    const oa = stripAccents(o);
    if (oa === ta) return 'close';
    const tolerance = oa.length >= 12 ? 2 : oa.length >= 5 ? 1 : 0;
    if (tolerance && levenshtein(ta, oa) <= tolerance) return 'close';
  }
  return 'wrong';
}
