import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expandKeyword, nextBox, prevBox } from '../js/math-edit.js';

const type = (text) => ({ text, caret: text.length });

test('« sum » + Espace hors formule : somme avec bornes, curseur dans la borne du bas', () => {
  const r = expandKeyword(...Object.values(type('Série : sum')));
  assert.equal(r.text, 'Série : $\\sum_{}^{}$');
  assert.equal(r.text.slice(0, r.caret), 'Série : $\\sum_{');
});

test('« frac » et « vect » : curseur dans la première case', () => {
  const f = expandKeyword('frac', 4);
  assert.equal(f.text, '$\\frac{}{}$');
  assert.equal(f.caret, '$\\frac{'.length);
  const v = expandKeyword('soit vect', 9);
  assert.equal(v.text, 'soit $\\vec{}$');
  assert.equal(v.text.slice(0, v.caret), 'soit $\\vec{');
});

test('dans une formule existante : pas de $ en plus', () => {
  const text = '$x + frac$';
  const r = expandKeyword(text, 9);
  assert.equal(r.text, '$x + \\frac{}{}$');
});

test('mots ordinaires non transformés', () => {
  assert.equal(expandKeyword('summum', 6), null);
  assert.equal(expandKeyword('vecteur', 7), null);
  assert.equal(expandKeyword('avec', 4), null);
  assert.equal(expandKeyword('$\\sum', 5), null, 'commande LaTeX déjà écrite');
  assert.equal(expandKeyword('Sum', 3), null, 'majuscule : texte normal');
});

test('Tab : numérateur → dénominateur → sortie de la formule', () => {
  let text = 'a $\\frac{12}{}$ b';
  let caret = 'a $\\frac{12'.length;
  caret = nextBox(text, caret);
  assert.equal(text.slice(0, caret), 'a $\\frac{12}{');
  text = 'a $\\frac{12}{5}$ b';
  caret = nextBox(text, caret + 1);
  assert.equal(text.slice(0, caret), 'a $\\frac{12}{5}$');
  assert.equal(nextBox(text, 1), null, 'hors formule : Tab normal');
});

test('Tab dans une somme : borne du bas → borne du haut ; Maj+Tab revient', () => {
  const text = '$\\sum_{k=0}^{}$';
  const up = nextBox(text, '$\\sum_{k=0'.length);
  assert.equal(text.slice(0, up), '$\\sum_{k=0}^{');
  const t2 = '$\\frac{}{}$';
  assert.equal(prevBox(t2, '$\\frac{}{'.length), '$\\frac{'.length);
  assert.equal(prevBox(t2, '$\\frac{'.length), null);
});
