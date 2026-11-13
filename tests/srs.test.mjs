import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, MINUTE, Rating, addDays, dayStart, formatDays, formatDuration, newSrs, previewIntervals, schedule } from '../js/srs.js';

const noFuzz = () => 0.5;
// Ces tests portent sur l'algorithme SM-2 (toujours disponible en option).
const SM2 = { algorithm: 'sm2' };
// Un mardi à 10 h (heure locale), loin d'un changement d'heure.
const T0 = new Date(2026, 2, 10, 10, 0, 0).getTime();

test('nouvelle carte : « À revoir » repart à la première étape (1 min)', () => {
  const s = schedule(newSrs(), Rating.Again, T0, SM2, noFuzz);
  assert.equal(s.state, 'learning');
  assert.equal(s.step, 0);
  assert.equal(s.due, T0 + 1 * MINUTE);
  assert.equal(s.ease, 2.5);
});

test('nouvelle carte : « Correct » passe à l’étape suivante (10 min)', () => {
  const s = schedule(newSrs(), Rating.Good, T0, SM2, noFuzz);
  assert.equal(s.state, 'learning');
  assert.equal(s.step, 1);
  assert.equal(s.due, T0 + 10 * MINUTE);
});

test('nouvelle carte : « Difficile » sur la première étape = moyenne des deux premières', () => {
  const s = schedule(newSrs(), Rating.Hard, T0, SM2, noFuzz);
  assert.equal(s.due, T0 + 5.5 * MINUTE);
});

test('nouvelle carte : « Facile » la fait passer directement en révision à 4 jours', () => {
  const s = schedule(newSrs(), Rating.Easy, T0, SM2, noFuzz);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 4);
  assert.equal(s.due, addDays(dayStart(T0), 4));
});

test('dernière étape réussie : passage en révision à 1 jour, disponible dès 4 h le lendemain', () => {
  let s = schedule(newSrs(), Rating.Good, T0, SM2, noFuzz);
  s = schedule(s, Rating.Good, T0 + 10 * MINUTE, SM2, noFuzz);
  assert.equal(s.state, 'review');
  assert.equal(s.interval, 1);
  const tomorrow4am = new Date(2026, 2, 11, 4, 0, 0).getTime();
  assert.equal(s.due, tomorrow4am);
});

test('révision : les intervalles grandissent et Difficile < Correct < Facile', () => {
  const card = { ...newSrs(), state: 'review', interval: 10, ease: 2.5, due: dayStart(T0) };
  const hard = schedule(card, Rating.Hard, T0, SM2, noFuzz);
  const good = schedule(card, Rating.Good, T0, SM2, noFuzz);
  const easy = schedule(card, Rating.Easy, T0, SM2, noFuzz);
  assert.equal(hard.interval, 12);
  assert.equal(good.interval, 25);
  assert.equal(easy.interval, 33);
  assert.ok(hard.interval < good.interval && good.interval < easy.interval);
  assert.equal(hard.ease, 2.35);
  assert.equal(good.ease, 2.5);
  assert.equal(easy.ease, 2.65);
});

test('révision en retard : le retard compte à moitié pour « Correct »', () => {
  const card = { ...newSrs(), state: 'review', interval: 10, ease: 2.5, due: addDays(dayStart(T0), -4) };
  const good = schedule(card, Rating.Good, T0, SM2, noFuzz);
  assert.equal(good.interval, Math.round((10 + 2) * 2.5));
});

test('oubli en révision : facilité −0,2, réapprentissage à 10 min, intervalle remis à 1 jour', () => {
  const card = { ...newSrs(), state: 'review', interval: 30, ease: 2.5, due: dayStart(T0), lapses: 0 };
  const s = schedule(card, Rating.Again, T0, SM2, noFuzz);
  assert.equal(s.state, 'relearning');
  assert.equal(s.lapses, 1);
  assert.equal(s.ease, 2.3);
  assert.equal(s.interval, 1);
  assert.equal(s.due, T0 + 10 * MINUTE);
  const back = schedule(s, Rating.Good, T0 + 10 * MINUTE, SM2, noFuzz);
  assert.equal(back.state, 'review');
  assert.equal(back.interval, 1);
});

test('la facilité ne descend jamais sous 1,3', () => {
  let s = { ...newSrs(), state: 'review', interval: 5, ease: 1.35, due: dayStart(T0) };
  s = schedule(s, Rating.Again, T0, SM2, noFuzz);
  assert.equal(s.ease, 1.3);
});

test('l’intervalle maximum est respecté', () => {
  const card = { ...newSrs(), state: 'review', interval: 300, ease: 3, due: dayStart(T0) };
  const s = schedule(card, Rating.Easy, T0, { ...SM2, maximumInterval: 365 }, noFuzz);
  assert.equal(s.interval, 365);
});

test('le « fuzz » reste dans une plage raisonnable', () => {
  const card = { ...newSrs(), state: 'review', interval: 20, ease: 2.5, due: dayStart(T0) };
  const lo = schedule(card, Rating.Good, T0, SM2, () => 0);
  const hi = schedule(card, Rating.Good, T0, SM2, () => 0.999);
  assert.ok(lo.interval >= 45 && lo.interval <= 50, `bas : ${lo.interval}`);
  assert.ok(hi.interval >= 50 && hi.interval <= 55, `haut : ${hi.interval}`);
});

test('dayStart : avant 4 h, on est encore dans la journée de la veille', () => {
  const night = new Date(2026, 2, 10, 2, 30).getTime();
  assert.equal(dayStart(night), new Date(2026, 2, 9, 4, 0).getTime());
  const morning = new Date(2026, 2, 10, 4, 0).getTime();
  assert.equal(dayStart(morning), morning);
});

test('SM-2 : aperçu des délais affichés sur les boutons', () => {
  const p = previewIntervals(newSrs(), T0, SM2);
  assert.deepEqual(p, { 1: '1 min', 2: '6 min', 3: '10 min', 4: '4 j' });
});

test('formats lisibles', () => {
  assert.equal(formatDuration(20 * 1000), '< 1 min');
  assert.equal(formatDuration(90 * MINUTE), '1,5 h');
  assert.equal(formatDuration(3 * DAY), '3 j');
  assert.equal(formatDays(45), '1,5 mois');
  assert.equal(formatDays(365), '1 an');
  assert.equal(formatDays(800), '2,2 ans');
});
