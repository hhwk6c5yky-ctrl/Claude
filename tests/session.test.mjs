import { test } from 'node:test';
import assert from 'node:assert/strict';
import { StudySession, dueCounts, selectForSession } from '../js/session.js';
import { MINUTE, Rating, dayStart, newSrs } from '../js/srs.js';

const T0 = new Date(2026, 2, 10, 10, 0, 0).getTime();
const card = (id, srs = {}, position = 0) => ({ id, deckId: 'd', position, srs: { ...newSrs(), ...srs } });
const review = (id, dueOffsetDays = 0) => card(id, { state: 'review', interval: 5, ease: 2.5, due: dayStart(T0) + dueOffsetDays * 86400000 });

test('limites de nouvelles cartes et de révisions', () => {
  const cards = [card('n1', {}, 1), card('n2', {}, 2), card('n3', {}, 3), review('r1'), review('r2'), review('r3', 3)];
  const s = new StudySession(cards, { now: T0, newLimit: 2, reviewLimit: 1 });
  assert.deepEqual(s.counts(T0), { fresh: 2, learn: 0, review: 1 });
  assert.deepEqual(s.fresh.map((c) => c.id), ['n1', 'n2']);
});

test('une carte ratée revient plus tard dans la séance', () => {
  const s = new StudySession([card('a'), card('b')], { now: T0, newLimit: 10 });
  let n = s.next(T0);
  assert.equal(n.card.id, 'a');
  s.answer(n.card, Rating.Again, T0, () => 0.5);
  n = s.next(T0);
  assert.equal(n.card.id, 'b', 'la carte suivante passe avant la carte ratée');
  s.answer(n.card, Rating.Good, T0, () => 0.5);
  n = s.next(T0 + 2 * MINUTE);
  assert.equal(n.card.id, 'a');
  assert.equal(n.queue, 'learn');
});

test('s’il ne reste que des cartes en apprentissage lointaines, la séance indique l’attente', () => {
  const s = new StudySession([card('a')], { now: T0, newLimit: 10, settings: { learningSteps: [60] } });
  const n = s.next(T0);
  s.answer(n.card, Rating.Again, T0, () => 0.5);
  const w = s.next(T0);
  assert.ok(w.wait > 0);
  assert.equal(w.card.id, 'a');
});

test('apprentissage anticipé : une carte due dans moins de 20 min est montrée s’il n’y a rien d’autre', () => {
  const s = new StudySession([card('a')], { now: T0, newLimit: 10 });
  s.answer(s.next(T0).card, Rating.Good, T0, () => 0.5); // prochaine étape : 10 min
  const n = s.next(T0);
  assert.equal(n.card.id, 'a');
});

test('séance terminée quand tout est réussi', () => {
  const s = new StudySession([card('a')], { now: T0, newLimit: 10 });
  s.answer(s.next(T0).card, Rating.Easy, T0, () => 0.5);
  assert.equal(s.next(T0), null);
});

test('annuler restaure la file et la carte', () => {
  const s = new StudySession([card('a'), card('b')], { now: T0, newLimit: 10 });
  const first = s.next(T0).card;
  s.answer(first, Rating.Easy, T0, () => 0.5);
  assert.equal(s.fresh.length, 1);
  const restored = s.undo();
  assert.equal(restored.id, 'a');
  assert.equal(restored.srs.state, 'new');
  assert.equal(s.fresh.length, 2);
  assert.equal(s.next(T0).card.id, 'a');
});

test('les nouvelles cartes sont réparties parmi les révisions', () => {
  const cards = [card('n1', {}, 1), card('n2', {}, 2), ...['r1', 'r2', 'r3', 'r4'].map((id) => review(id))];
  const s = new StudySession(cards, { now: T0, newLimit: 10 });
  const order = [];
  for (let i = 0; i < 6; i++) {
    const n = s.next(T0);
    order.push(n.queue);
    s.answer(n.card, Rating.Easy, T0, () => 0.5);
  }
  assert.deepEqual(order, ['review', 'new', 'review', 'review', 'new', 'review']);
});

test('dueCounts tient compte de ce qui a déjà été fait aujourd’hui', () => {
  const cards = [card('n1'), card('n2'), card('n3'), review('r1'), card('l1', { state: 'learning', due: T0 + 5 * MINUTE })];
  const c = dueCounts(cards, { now: T0, newPerDay: 5, doneToday: { fresh: 4, review: 0 } });
  assert.deepEqual(c, { fresh: 1, learn: 1, review: 1 });
});

test('ordre mélangé : toutes les cartes, dans un autre ordre', () => {
  const cards = Array.from({ length: 30 }, (_, i) => card(`n${i}`, {}, i));
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const s = new StudySession(cards, { now: T0, newLimit: 30, shuffle: true, rng });
  const order = s.fresh.map((c) => c.id);
  assert.equal(new Set(order).size, 30);
  assert.notDeepEqual(order, cards.map((c) => c.id));
  const sorted = new StudySession(cards, { now: T0, newLimit: 30 });
  assert.deepEqual(sorted.fresh.map((c) => c.id), cards.map((c) => c.id), 'ordre trié par défaut');
});

test('dossier : limites de chaque paquet respectées, ordre trié paquet par paquet', () => {
  const deckA = { id: 'A', newPerDay: 2, reviewsPerDay: 1 };
  const deckB = { id: 'B', newPerDay: 3, reviewsPerDay: 200 };
  const mk = (deck, id, srs, pos) => ({ ...card(id, srs, pos), deckId: deck });
  const cardsByDeck = new Map([
    ['A', [mk('A', 'a1', {}, 1), mk('A', 'a2', {}, 2), mk('A', 'a3', {}, 3), { ...review('ar1'), deckId: 'A' }, { ...review('ar2'), deckId: 'A' }]],
    ['B', [mk('B', 'b1', {}, 0), mk('B', 'b2', {}, 5), mk('B', 'b3', {}, 9), mk('B', 'b4', {}, 10)]],
  ]);
  const done = new Map([['B', { fresh: 1, review: 0 }]]);
  const { cards, deckRank } = selectForSession([deckA, deckB], cardsByDeck, done, { now: T0 });
  const ids = cards.map((c) => c.id).sort();
  assert.deepEqual(ids, ['a1', 'a2', 'ar1', 'b1', 'b2'], '2 nouvelles de A, 1 révision de A, 3-1 nouvelles de B');
  const s = new StudySession(cards, { now: T0, newLimit: Infinity, reviewLimit: Infinity, deckRank });
  assert.deepEqual(s.fresh.map((c) => c.id), ['a1', 'a2', 'b1', 'b2'], 'paquet A puis paquet B');
  const extra = selectForSession([deckA, deckB], cardsByDeck, done, { now: T0, extraNew: 3 });
  assert.equal(extra.cards.filter((c) => c.srs.state === 'new').length, 3, '« 10 de plus » pris sur tout le dossier');
});
