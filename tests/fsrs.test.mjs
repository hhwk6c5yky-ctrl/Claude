import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FSRS_DEFAULT_W, initDifficulty, intervalFor, memoryFromSm2, nextMemory, retrievability } from '../js/fsrs.js';
import { previewIntervals, schedule, newSrs, MINUTE } from '../js/srs.js';

// Valeurs de référence calculées avec ts-fsrs 5.4.2 (FSRS-6), la bibliothèque
// officielle du projet FSRS : mêmes paramètres, sans aléa, étapes 1 min / 10 min.
const REFERENCE = [
  ['3333333', 'étape 2j 11j 46j 163j 498j 1348j'],
  ['33313333', 'étape 2j 11j étape 2j 5j 12j 28j'],
  ['432343', '8j 39j 108j 294j 1099j 2762j'],
  ['133223134', 'étape étape 1j 1j 3j 6j étape 1j 4j'],
  ['3344133', 'étape 2j 19j 136j étape 5j 13j'],
  ['23333', 'étape étape 1j 5j 17j'],
];

test('FSRS : mêmes intervalles que la bibliothèque de référence ts-fsrs', () => {
  for (const [answers, expected] of REFERENCE) {
    let card = newSrs();
    let t = Date.UTC(2026, 2, 10, 10);
    const got = [];
    for (const g of answers) {
      card = schedule(card, Number(g), t, undefined, () => 0.5);
      got.push(card.state === 'review' ? `${card.interval}j` : 'étape');
      t = card.state === 'review' ? card.due + 6 * 3600e3 : card.due; // révision au moment prévu
    }
    assert.equal(got.join(' '), expected, `réponses ${answers}`);
  }
});

test('FSRS : 90 % de chances de se souvenir après S jours', () => {
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.ok(retrievability(30, 10) < 0.9 && retrievability(3, 10) > 0.9);
  assert.equal(intervalFor(10, 0.9), 10);
  assert.ok(intervalFor(10, 0.95) < 10 && intervalFor(10, 0.8) > 10, 'rétention plus haute = révisions plus fréquentes');
});

test('FSRS : état initial selon la première réponse', () => {
  assert.deepEqual(nextMemory(null, 0, 3), { s: FSRS_DEFAULT_W[2], d: initDifficulty(3) });
  assert.ok(nextMemory(null, 0, 1).d > nextMemory(null, 0, 4).d, 'À revoir = plus difficile que Facile');
});

test('FSRS : boutons d’une nouvelle carte et ordre des intervalles en révision', () => {
  assert.deepEqual(previewIntervals(newSrs(), Date.UTC(2026, 2, 10, 10)), { 1: '1 min', 2: '6 min', 3: '10 min', 4: '8 j' });
  const card = { ...newSrs(), state: 'review', s: 20, d: 5, interval: 20, ease: 2.5, lastReview: Date.UTC(2026, 2, 1, 10), due: Date.UTC(2026, 2, 21, 4) };
  const at = Date.UTC(2026, 2, 21, 10);
  const iv = [2, 3, 4].map((g) => schedule(card, g, at, undefined, () => 0.5).interval);
  assert.ok(iv[0] < iv[1] && iv[1] < iv[2], `Difficile < Correct < Facile : ${iv}`);
  const lapse = schedule(card, 1, at, undefined, () => 0.5);
  assert.equal(lapse.state, 'relearning');
  assert.equal(lapse.lapses, 1);
  assert.equal(lapse.due, at + 10 * MINUTE);
  assert.ok(lapse.s < 20, 'un oubli fait baisser la stabilité');
});

test('FSRS : une carte révisée avec SM-2 continue sans repartir de zéro', () => {
  assert.deepEqual(memoryFromSm2(30, 2.5), { s: 30, d: 5 });
  assert.equal(memoryFromSm2(30, 1.3).d, 10);
  const old = { ...newSrs(), state: 'review', interval: 30, ease: 2.5, reps: 6, lastReview: Date.UTC(2026, 1, 8, 10), due: Date.UTC(2026, 2, 10, 4) };
  const next = schedule(old, 3, Date.UTC(2026, 2, 10, 10), undefined, () => 0.5);
  assert.ok(next.interval > 30, `intervalle prolongé : ${next.interval} j`);
  assert.ok(Number.isFinite(next.s) && Number.isFinite(next.d));
});

test('FSRS : rétention visée réglable', () => {
  const card = { ...newSrs(), state: 'review', s: 20, d: 5, interval: 20, lastReview: Date.UTC(2026, 2, 1, 10), due: Date.UTC(2026, 2, 21, 4) };
  const at = Date.UTC(2026, 2, 21, 10);
  const low = schedule(card, 3, at, { desiredRetention: 0.8 }, () => 0.5).interval;
  const high = schedule(card, 3, at, { desiredRetention: 0.95 }, () => 0.5).interval;
  assert.ok(high < low, `95 % : ${high} j < 80 % : ${low} j`);
});

test('mémoire estimée d’un paquet', async () => {
  const { estimatedMemory } = await import('../js/store.js');
  const now = Date.UTC(2026, 2, 20, 10);
  const day = 86400000;
  const cards = [
    { srs: { state: 'new' } },
    { srs: { state: 'review', s: 10, d: 5, lastReview: now - 10 * day } }, // 90 %
    { srs: { state: 'review', s: 10, d: 5, lastReview: now } }, // 100 %
  ];
  assert.ok(Math.abs(estimatedMemory(cards, now) - 0.95) < 1e-6);
  assert.equal(estimatedMemory([{ srs: { state: 'new' } }], now), null);
});
