import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planSync } from '../js/sync-plan.js';

const card = (id, updatedAt, extra = {}) => ({ id, deckId: 'd1', updatedAt, front: { text: id }, back: { text: '' }, ...extra });
const deck = (id, updatedAt) => ({ id, name: id, updatedAt });
const remoteOf = (entries) => new Map(entries);

test('premier appareil : tout est envoyé', () => {
  const p = planSync({ decks: [deck('d1', 5)], cards: [card('a', 5), card('b', 6)], remote: new Map() });
  assert.deepEqual(p.push.map(([id]) => id).sort(), ['c_a', 'c_b', 'd_d1']);
  assert.equal(p.pullCards.length, 0);
});

test('nouvel appareil vide : tout est récupéré', () => {
  const remote = remoteOf([
    ['d_d1', { kind: 'deck', data: deck('d1', 5), updatedAt: 5 }],
    ['c_a', { kind: 'card', data: card('a', 5), updatedAt: 5 }],
  ]);
  const p = planSync({ decks: [], cards: [], remote });
  assert.deepEqual(p.pullDecks.map((d) => d.id), ['d1']);
  assert.deepEqual(p.pullCards.map((c) => c.id), ['a']);
  assert.equal(p.push.length, 0);
});

test('la modification la plus récente gagne, dans les deux sens', () => {
  const remote = remoteOf([
    ['c_a', { kind: 'card', data: card('a', 10, { front: { text: 'distant' } }), updatedAt: 10 }],
    ['c_b', { kind: 'card', data: card('b', 3), updatedAt: 3 }],
    ['c_c', { kind: 'card', data: card('c', 7), updatedAt: 7 }],
  ]);
  const p = planSync({ decks: [], cards: [card('a', 4), card('b', 9), card('c', 7)], remote });
  assert.deepEqual(p.pullCards.map((c) => c.front.text), ['distant']);
  assert.deepEqual(p.push.map(([id]) => id), ['c_b']);
});

test('suppression locale propagée, puis pierre tombale effacée', () => {
  const remote = remoteOf([['c_a', { kind: 'card', data: card('a', 5), updatedAt: 5 }]]);
  const p = planSync({ decks: [], cards: [], tombstones: { 'card:a': 8 }, remote });
  assert.deepEqual(p.push, [['c_a', { kind: 'card', deleted: true, updatedAt: 8 }]]);
  assert.deepEqual(p.pushedTombstones, ['card:a']);
  assert.equal(p.pullCards.length, 0);
});

test('suppression faite sur un autre appareil appliquée ici', () => {
  const remote = remoteOf([['c_a', { kind: 'card', deleted: true, updatedAt: 9 }]]);
  const p = planSync({ decks: [], cards: [card('a', 5)], remote });
  assert.deepEqual(p.deleteCardIds, ['a']);
  assert.equal(p.push.length, 0);
});

test('carte modifiée ici après sa suppression ailleurs : elle est conservée', () => {
  const remote = remoteOf([['c_a', { kind: 'card', deleted: true, updatedAt: 5 }]]);
  const p = planSync({ decks: [], cards: [card('a', 9)], remote });
  assert.deepEqual(p.push.map(([id]) => id), ['c_a']);
  assert.equal(p.deleteCardIds.length, 0);
});

test('carte recréée ailleurs après une suppression locale plus ancienne : elle revient', () => {
  const remote = remoteOf([['c_a', { kind: 'card', data: card('a', 12), updatedAt: 12 }]]);
  const p = planSync({ decks: [], cards: [], tombstones: { 'card:a': 8 }, remote });
  assert.deepEqual(p.pullCards.map((c) => c.id), ['a']);
  assert.deepEqual(p.clearTombstones, ['card:a']);
});

test('rien à faire quand tout est identique', () => {
  const remote = remoteOf([['c_a', { kind: 'card', data: card('a', 5), updatedAt: 5 }]]);
  const p = planSync({ decks: [], cards: [card('a', 5)], remote });
  assert.equal(p.push.length + p.pullCards.length + p.deleteCardIds.length, 0);
});

test('les pointeurs d’images (i_…) sont ignorés par la fusion', () => {
  const remote = remoteOf([['i_x', { kind: 'image', asset: 'abc', createdAt: 1 }]]);
  const p = planSync({ decks: [], cards: [], remote });
  assert.equal(p.push.length + p.pullCards.length + p.pullDecks.length, 0);
});
