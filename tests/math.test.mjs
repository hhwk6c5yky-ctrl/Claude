import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasMath, mathToPlain, splitMath, texToPlain } from '../js/math.js';
import { checkAnswer } from '../js/answer.js';

test('formule dans le texte et formule centrée', () => {
  assert.deepEqual(splitMath('Aire : $\\pi r^2$ cm²'), [
    { type: 'text', value: 'Aire : ' },
    { type: 'math', value: '\\pi r^2', display: false },
    { type: 'text', value: ' cm²' },
  ]);
  assert.deepEqual(splitMath('$$\\int_0^1 x\\,dx$$'), [{ type: 'math', value: '\\int_0^1 x\\,dx', display: true }]);
  assert.deepEqual(splitMath('\\(a+b\\) et \\[c\\]').filter((p) => p.type === 'math').map((p) => p.display), [false, true]);
});

test('les prix et les $ isolés restent du texte', () => {
  assert.equal(hasMath('Ça coûte 5 $ et 10 $'), false);
  assert.equal(hasMath('entre $5 et $10'), false);
  assert.equal(hasMath('un seul $ ici'), false);
  assert.equal(hasMath('\\$x$'), false);
  assert.equal(mathToPlain('prix : 3\\$'), 'prix : 3$');
});

test('lettres grecques et symboles Unicode : pas de formule nécessaire', () => {
  assert.equal(hasMath('α + β = γ, x ≤ 2π'), false);
  assert.deepEqual(splitMath('Δ = b² − 4ac'), [{ type: 'text', value: 'Δ = b² − 4ac' }]);
});

test('conversion LaTeX → texte lisible', () => {
  assert.equal(texToPlain('\\alpha + \\beta'), 'α + β');
  assert.equal(texToPlain('x^2 + y_1'), 'x² + y₁');
  assert.equal(texToPlain('\\frac{1}{2}'), '1/2');
  assert.equal(texToPlain('\\frac{a+b}{\\pi}'), '(a+b)/π');
  assert.equal(texToPlain('\\sqrt{2}'), '√2');
  assert.equal(texToPlain('x \\in \\mathbb{R}'), 'x ∈ ℝ');
  assert.equal(texToPlain('\\Delta = b^2 - 4ac'), 'Δ = b² - 4ac');
  assert.equal(texToPlain('\\text{si } x \\geq 0'), 'si x ≥ 0');
  assert.equal(texToPlain('e^{i\\pi}'), 'e^(iπ)');
});

test('réponse écrite : symboles acceptés pour une carte en LaTeX', () => {
  assert.equal(checkAnswer('α', '$\\alpha$'), 'correct');
  assert.equal(checkAnswer('\\alpha', '$\\alpha$'), 'correct');
  assert.equal(checkAnswer('x²', '$x^2$'), 'correct');
  assert.equal(checkAnswer('1/2', '$\\frac{1}{2}$'), 'correct');
  assert.equal(checkAnswer('π', 'π'), 'correct');
  assert.equal(checkAnswer('β', '$\\alpha$'), 'wrong');
});
