import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkAnswer, levenshtein } from '../js/answer.js';

test('réponse exacte, casse et espaces ignorés', () => {
  assert.equal(checkAnswer('  La Météo ', 'la météo'), 'correct');
  assert.equal(checkAnswer('emprunter.', 'emprunter'), 'correct');
});

test('accents oubliés ou petite faute de frappe = presque', () => {
  assert.equal(checkAnswer('la meteo', 'la météo'), 'close');
  assert.equal(checkAnswer('bibliotheqe', 'bibliothèque'), 'close');
});

test('plusieurs réponses acceptées séparées par / ou ;', () => {
  assert.equal(checkAnswer('car', 'voiture / car'), 'correct');
  assert.equal(checkAnswer('voiture', 'voiture; auto'), 'correct');
});

test('mauvaise réponse ou réponse vide', () => {
  assert.equal(checkAnswer('chien', 'chat'), 'wrong');
  assert.equal(checkAnswer('', 'chat'), 'wrong');
  assert.equal(checkAnswer('cha', 'chat'), 'wrong');
});

test('distance de Levenshtein', () => {
  assert.equal(levenshtein('kitten', 'sitting'), 3);
  assert.equal(levenshtein('', 'abc'), 3);
});
