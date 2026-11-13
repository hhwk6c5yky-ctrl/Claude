// FSRS-6 (Free Spaced Repetition Scheduler) : le modèle de mémoire utilisé par Anki
// depuis 2023. Fonctions pures, conformes à la bibliothèque de référence ts-fsrs
// (vérifié par comparaison numérique, voir tests/fsrs.test.mjs).
//
// Chaque carte a deux grandeurs :
//   S (stabilité)  : nombre de jours au bout desquels on a 90 % de chances de s'en souvenir
//   D (difficulté) : de 1 (facile) à 10 (difficile)
// La probabilité de s'en souvenir après t jours est R(t) = (1 + F·t/S)^(-decay).
// On révise quand R descend à la rétention visée (90 % par défaut).

/** Paramètres par défaut de FSRS-6, entraînés sur des millions de révisions Anki. */
export const FSRS_DEFAULT_W = Object.freeze([
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614,
  0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
]);

const S_MIN = 0.001;
const S_MAX = 36500;

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const round8 = (x) => Math.round(x * 1e8) / 1e8;

function curve(w) {
  const decay = -w[20];
  const factor = Math.pow(0.9, 1 / decay) - 1;
  return { decay, factor };
}

/** Probabilité de se souvenir après `t` jours pour une stabilité `s`. */
export function retrievability(t, s, w = FSRS_DEFAULT_W) {
  const { decay, factor } = curve(w);
  return Math.pow(1 + (factor * Math.max(0, t)) / s, decay);
}

export function initStability(g, w = FSRS_DEFAULT_W) {
  return Math.max(w[g - 1], 0.1);
}

export function initDifficulty(g, w = FSRS_DEFAULT_W) {
  return w[4] - Math.exp((g - 1) * w[5]) + 1;
}

export function nextDifficulty(d, g, w = FSRS_DEFAULT_W) {
  const delta = -w[6] * (g - 3);
  const damped = d + (delta * (10 - d)) / 9; // les changements ralentissent près de 10
  const reverted = w[7] * initDifficulty(4, w) + (1 - w[7]) * damped; // léger retour vers la moyenne
  return clamp(reverted, 1, 10);
}

export function nextRecallStability(d, s, r, g, w = FSRS_DEFAULT_W) {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  const inc = Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp((1 - r) * w[10]) - 1) * hard * easy;
  return clamp(s * (1 + inc), S_MIN, S_MAX);
}

export function nextForgetStability(d, s, r, w = FSRS_DEFAULT_W) {
  const after = clamp(w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp((1 - r) * w[14]), S_MIN, S_MAX);
  // Après un oubli, la stabilité ne peut pas dépasser celle d'avant.
  return clamp(s / Math.exp(w[17] * w[18]), S_MIN, after);
}

/** Révisions le même jour (étapes d'apprentissage). */
export function nextShortTermStability(s, g, w = FSRS_DEFAULT_W) {
  const sinc = Math.pow(s, -w[19]) * Math.exp(w[17] * (g - 3 + w[18]));
  return clamp(s * (g >= 2 ? Math.max(sinc, 1) : sinc), S_MIN, S_MAX);
}

/**
 * Nouvel état de mémoire après une réponse.
 * @param {{s:number, d:number}|null} mem état actuel (null pour une carte jamais vue)
 * @param {number} t jours écoulés depuis la dernière révision
 * @param {1|2|3|4} g note
 */
export function nextMemory(mem, t, g, w = FSRS_DEFAULT_W) {
  if (!mem) return { s: initStability(g, w), d: clamp(initDifficulty(g, w), 1, 10) };
  const r = retrievability(t, mem.s, w);
  let s;
  if (t === 0) s = nextShortTermStability(mem.s, g, w);
  else if (g === 1) s = nextForgetStability(mem.d, mem.s, r, w);
  else s = nextRecallStability(mem.d, mem.s, r, g, w);
  return { s: round8(s), d: round8(nextDifficulty(mem.d, g, w)) };
}

/** Intervalle (jours) pour que la probabilité de souvenir retombe à `retention`. */
export function intervalFor(s, retention = 0.9, maximum = 36500, w = FSRS_DEFAULT_W) {
  const { decay, factor } = curve(w);
  const modifier = (Math.pow(retention, 1 / decay) - 1) / factor;
  return Math.min(Math.max(1, Math.round(s * modifier)), maximum);
}

/**
 * État de mémoire estimé pour une carte planifiée avec SM-2 (avant le passage à FSRS) :
 * l'intervalle sert de stabilité (90 % de chances au moment prévu) et la facilité
 * donne la difficulté (2,5 → 5 ; 1,3 → 10).
 */
export function memoryFromSm2(interval, ease) {
  const s = clamp(interval || 1, 0.1, S_MAX);
  const d = clamp(5 + (2.5 - (ease || 2.5)) * (5 / 1.2), 1, 10);
  return { s, d };
}
