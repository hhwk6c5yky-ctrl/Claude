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

test('majuscule automatique du téléphone : « Sum » marche aussi, pas « SUM »', () => {
  assert.equal(expandKeyword('Sum', 3).text, '$\\sum_{}^{}$');
  assert.equal(expandKeyword('Frac', 4).text, '$\\frac{}{}$');
  assert.equal(expandKeyword('SUM', 3), null);
  assert.equal(expandKeyword('Vecteur', 7), null);
});

test('ind / exp / exxp : indice et exposant collés à ce qui précède', () => {
  const cur = (r) => r.text.slice(0, r.caret);
  let r = expandKeyword('soit u ind', 10);
  assert.equal(r.text, 'soit $u_{}$');
  assert.equal(cur(r), 'soit $u_{');
  r = expandKeyword('x exp', 5);
  assert.equal(r.text, '$x^{}$');
  assert.equal(expandKeyword('2 exxp', 6).text, '$2^{}$');
  assert.equal(expandKeyword('f(x) exp', 8).text, '$f(x)^{}$', 'f(x) entier');
  r = expandKeyword('$x$ exp', 7);
  assert.equal(r.text, '$x^{}$', 'ajouté dans la formule qui précède');
  assert.equal(cur(r), '$x^{');
  r = expandKeyword('$a + u ind$', 10);
  assert.equal(r.text, '$a + u_{}$', 'dans une formule');
  assert.equal(expandKeyword('ind', 3).text, '$_{}$', 'sans base');
  assert.equal(expandKeyword('find', 4), null);
  assert.equal(expandKeyword('index', 5), null);
});

test('bar : barre au-dessus d’une lettre, d’un groupe ou d’une formule, pas d’un mot', () => {
  const cur = (r) => r.text.slice(0, r.caret);
  let r = expandKeyword('soit z bar', 10);
  assert.equal(r.text, 'soit $\\overline{z}$');
  assert.equal(cur(r), 'soit $\\overline{z', 'curseur dans la barre');
  assert.equal(expandKeyword('(a+b) bar', 9).text, '$\\overline{(a+b)}$');
  assert.equal(expandKeyword('$x+y$ bar', 9).text, '$\\overline{x+y}$');
  assert.equal(expandKeyword('$a + z bar$', 10).text, '$a + \\overline{z}$', 'dans une formule');
  r = expandKeyword('bar', 3);
  assert.equal(r.text, '$\\overline{}$');
  assert.equal(cur(r), '$\\overline{');
  assert.equal(expandKeyword('je vais au bar', 14), null, '« au bar » reste du texte');
  assert.equal(expandKeyword('Le Bar', 6), null);
  // Tab sort de la barre
  assert.equal(nextBox('$\\overline{z}$ et', '$\\overline{z'.length), '$\\overline{z}$'.length);
});

test('abs et inf', () => {
  const cur = (r) => r.text.slice(0, r.caret);
  let r = expandKeyword('soit abs', 8);
  assert.equal(r.text, 'soit $\\left\\lvert{}\\right\\rvert$');
  assert.equal(cur(r), 'soit $\\left\\lvert{', 'curseur entre les barres');
  r = expandKeyword('x tend vers inf', 15);
  assert.equal(r.text, 'x tend vers $\\infty$ ');
  assert.equal(cur(r), 'x tend vers $\\infty$ ', 'curseur après la formule et l’espace');
  assert.equal(expandKeyword('$x \\to inf$', 10).text, '$x \\to \\infty $');
  assert.equal(expandKeyword('infini', 6), null);
  assert.equal(expandKeyword('absolu', 6), null);
});
