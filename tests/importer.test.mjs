import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectSeparators, parseCards, parseCsv, toTsv, unescapeSeparator } from '../js/importer.js';

test('export Quizlet par défaut : tabulation + nouvelle ligne', () => {
  const text = 'the weather\tla météo\r\nto borrow\temprunter\n\nlibrary\tbibliothèque\n';
  const { cards, skipped } = parseCards(text);
  assert.deepEqual(cards, [
    { front: 'the weather', back: 'la météo' },
    { front: 'to borrow', back: 'emprunter' },
    { front: 'library', back: 'bibliothèque' },
  ]);
  assert.deepEqual(skipped, []);
});

test('définition sur plusieurs lignes : les lignes sans tabulation prolongent la carte précédente', () => {
  const text = 'Photosynthèse\tProcessus qui\nproduit du glucose\nà partir de lumière\nMitose\tDivision cellulaire';
  const { cards } = parseCards(text);
  assert.equal(cards.length, 2);
  assert.equal(cards[0].back, 'Processus qui\nproduit du glucose\nà partir de lumière');
});

test('séparateurs personnalisés (Quizlet « Personnalisé »)', () => {
  const text = 'Terme 1 :: Déf 1\nsur deux lignes###Terme 2 :: Déf 2###';
  const { cards } = parseCards(text, { term: ' :: ', row: '###' });
  assert.deepEqual(cards, [
    { front: 'Terme 1', back: 'Déf 1\nsur deux lignes' },
    { front: 'Terme 2', back: 'Déf 2' },
  ]);
});

test('virgule + point-virgule (options Quizlet)', () => {
  const { cards } = parseCards('chat,cat;chien,dog;oiseau,bird', { term: ',', row: ';' });
  assert.deepEqual(cards.map((c) => c.back), ['cat', 'dog', 'bird']);
});

test('CSV avec guillemets et virgules dans la définition', () => {
  const text = 'mot,définition\n"Paris, France","capitale, ville"\n"multi\nligne",ok\nsimple,a, b';
  const { cards } = parseCards(text, { term: ',', row: '\n' });
  assert.deepEqual(cards[1], { front: 'Paris, France', back: 'capitale, ville' });
  assert.deepEqual(cards[2], { front: 'multi\nligne', back: 'ok' });
  assert.deepEqual(cards[3], { front: 'simple', back: 'a,  b' });
});

test('inversion terme / définition', () => {
  const { cards } = parseCards('a\tb', { swap: true });
  assert.deepEqual(cards, [{ front: 'b', back: 'a' }]);
});

test('lignes sans séparateur au début ou côté vide : signalées comme ignorées', () => {
  const { cards, skipped } = parseCards('titre du set\nterme\t\na\tb');
  assert.deepEqual(cards, [{ front: 'a', back: 'b' }]);
  assert.deepEqual(skipped, ['titre du set', 'terme']);
});

test('détection automatique des séparateurs', () => {
  assert.deepEqual(detectSeparators('a\tb\nc\td'), { term: '\t', row: '\n' });
  assert.deepEqual(detectSeparators('a,b\nc,d\ne,f'), { term: ',', row: '\n' });
  assert.deepEqual(detectSeparators('a - b\nc - d'), { term: ' - ', row: '\n' });
  assert.deepEqual(detectSeparators('a,b;c,d;e,f'), { term: ',', row: ';' });
});

test('séquences d’échappement tapées par l’utilisateur', () => {
  assert.equal(unescapeSeparator('\\n\\n'), '\n\n');
  assert.equal(unescapeSeparator('\\t'), '\t');
});

test('parseCsv gère les guillemets doublés', () => {
  assert.deepEqual(parseCsv('"il dit ""bonjour""",x'), [['il dit "bonjour"', 'x']]);
});

test('export texte au format Quizlet', () => {
  assert.equal(toTsv([{ front: 'a', back: 'b' }, { front: 'c\td', back: 'e' }]), 'a\tb\nc d\te');
});
