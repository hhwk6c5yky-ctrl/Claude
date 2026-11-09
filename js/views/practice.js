// Entraînement libre : parcourt tout le paquet sans toucher au planning de révision.
// Les cartes ratées reviennent un peu plus loin jusqu'à ce qu'elles soient sues.
import * as db from '../db.js';
import { checkAnswer } from '../answer.js';
import { h, icon, plural } from '../ui.js';
import { goBack } from '../router.js';
import { cardFace, screen } from './common.js';
import { symbolPicker } from '../symbols.js';
import { mathToPlain } from '../math.js';

const MODES = [
  { id: 'flip', label: 'Retourner la carte', help: 'Tu réfléchis, tu retournes, tu dis si tu savais.' },
  { id: 'write', label: 'Écrire la réponse', help: 'Tu tapes la réponse, l’appli la vérifie.' },
  { id: 'choice', label: 'QCM', help: 'Tu choisis parmi quatre réponses.' },
];
const DIRECTIONS = [
  { id: 'forward', label: 'Recto → verso' },
  { id: 'backward', label: 'Verso → recto' },
  { id: 'mixed', label: 'Les deux, au hasard' },
];

export async function practiceView({ deckId }) {
  const deck = await db.getDeck(deckId);
  if (!deck) throw new Error('Ce paquet n’existe plus.');
  const allCards = (await db.getCards(deckId)).sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  const body = h('div.practice');
  const options = { mode: 'flip', direction: 'forward', shuffle: true };
  let cleanupKeys = () => {};

  const setup = (subset = null) => {
    cleanupKeys();
    const pool = subset || allCards;
    if (!pool.length) {
      body.replaceChildren(h('div.study-message', h('h2', 'Ce paquet est vide'), h('p', 'Ajoute des cartes pour pouvoir t’entraîner.')));
      return;
    }
    const radio = (name, list, key) =>
      h(
        'fieldset.choice-group',
        h('legend', name),
        list.map((o) =>
          h(
            'label.choice',
            h('input', { type: 'radio', name: key, value: o.id, checked: options[key] === o.id, onchange: () => { options[key] = o.id; } }),
            h('span', h('strong', o.label), o.help ? h('small', o.help) : null),
          ),
        ),
      );
    const shuffle = h('label.check', h('input', { type: 'checkbox', checked: options.shuffle, onchange: (e) => { options.shuffle = e.target.checked; } }), 'Mélanger les cartes');
    body.replaceChildren(
      h(
        'div.practice-setup',
        h('p.lead', subset ? `On reprend les ${plural(pool.length, 'carte')} à retravailler.` : `Entraîne-toi sur les ${plural(pool.length, 'carte')} du paquet. Ton planning de révision n’est pas modifié.`),
        radio('Mode', MODES, 'mode'),
        radio('Sens', DIRECTIONS, 'direction'),
        shuffle,
        h('button.btn.primary.big.wide', { type: 'button', onclick: () => run(pool) }, 'Commencer'),
      ),
    );
  };

  const run = (pool) => {
    const items = pool.map((card) => ({ card, reversed: options.direction === 'backward' || (options.direction === 'mixed' && Math.random() < 0.5), misses: 0 }));
    let queue = options.shuffle ? shuffled(items) : [...items];
    const total = items.length;
    let known = 0;
    let current = null;
    let state = 'question';
    let typed = '';

    const progressFill = h('span.practice-fill');
    const progressText = h('span.practice-count');
    const stage = h('div.study-stage');
    const controls = h('div.study-controls');
    body.replaceChildren(h('div.practice-progress', h('div.practice-bar', progressFill), progressText), stage, controls);

    const updateProgress = () => {
      progressFill.style.width = `${(known / total) * 100}%`;
      progressText.textContent = `${known} / ${total} sue${known > 1 ? 's' : ''}`;
    };

    const sides = (item) => (item.reversed ? [item.card.back, item.card.front] : [item.card.front, item.card.back]);

    const modeFor = (item) => {
      const [, answer] = sides(item);
      if (options.mode === 'write' && !answer.text?.trim()) return 'flip';
      if (options.mode === 'choice' && distractors(item, 3).length < 2) return 'flip';
      return options.mode;
    };

    const distractors = (item, n) => {
      const [, answer] = sides(item);
      const key = (s) => `${s.text?.trim().toLowerCase()}|${s.imageId || ''}`;
      const seen = new Set([key(answer)]);
      const out = [];
      for (const other of shuffled(items)) {
        if (other.card.id === item.card.id) continue;
        const side = item.reversed ? other.card.front : other.card.back;
        const k = key(side);
        if (seen.has(k) || (!side.text?.trim() && !side.imageId)) continue;
        seen.add(k);
        out.push(side);
        if (out.length >= n) break;
      }
      return out;
    };

    const next = () => {
      updateProgress();
      if (!queue.length) return finish();
      current = queue.shift();
      state = 'question';
      typed = '';
      renderQuestion();
    };

    const renderQuestion = () => {
      const [question] = sides(current);
      const mode = modeFor(current);
      const sheet = h('article.bristol.study-card', cardFace(question, { size: 'large' }));
      stage.replaceChildren(sheet);
      if (mode === 'flip') {
        sheet.addEventListener('click', (e) => {
          if (!e.target.closest('.zoomable')) reveal();
        });
        controls.replaceChildren(h('button.btn.primary.big.wide', { type: 'button', onclick: () => reveal() }, 'Retourner la carte', h('kbd', 'Espace')));
      } else if (mode === 'write') {
        const input = h('input.input.type-answer', { id: 'practice-answer', type: 'text', placeholder: 'Ta réponse…', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterkeyhint: 'done' });
        const submit = () => {
          typed = input.value;
          reveal(checkAnswer(typed, sides(current)[1].text));
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        });
        const symbols = symbolPicker(() => input, { formulas: false, compact: true });
        controls.replaceChildren(h('label.sr-only', { for: 'practice-answer' }, 'Ta réponse'), symbols.panel, h('div.answer-row', input, symbols.button), h('div.button-row', h('button.btn', { type: 'button', onclick: () => { typed = ''; reveal('wrong'); } }, 'Je ne sais pas'), h('button.btn.primary', { type: 'button', onclick: submit }, 'Vérifier')));
        setTimeout(() => input.focus(), 30);
      } else {
        const [, answer] = sides(current);
        const choices = shuffled([{ side: answer, ok: true }, ...distractors(current, 3).map((side) => ({ side, ok: false }))]);
        const grid = h('div.mcq', { role: 'group', 'aria-label': 'Choisis la bonne réponse' });
        choices.forEach((c, i) => {
          const btn = h('button.mcq-option', { type: 'button', onclick: () => pick(c, btn) }, h('kbd', String(i + 1)), cardFace(c.side, { size: 'small', zoom: false }));
          c.btn = btn;
          grid.append(btn);
        });
        const pick = (choice, btn) => {
          if (state !== 'question') return;
          for (const c of choices) {
            c.btn.disabled = true;
            if (c.ok) c.btn.classList.add('right');
          }
          if (!choice.ok) btn.classList.add('wrong');
          reveal(choice.ok ? 'correct' : 'wrong', { keepControls: true });
          controls.append(h('button.btn.primary.big.wide', { type: 'button', onclick: () => grade(choice.ok) }, 'Continuer', h('kbd', 'Entrée')));
          controls.querySelector('.btn.primary')?.focus({ preventScroll: true });
        };
        current.choices = choices;
        current.pick = pick;
        controls.replaceChildren(grid);
      }
    };

    const reveal = (result = null, { keepControls = false } = {}) => {
      if (state !== 'question') return;
      state = 'answer';
      const [question, answer] = sides(current);
      let verdict = null;
      if (result) {
        const text = { correct: 'Bonne réponse', close: 'Presque : attention à l’orthographe', wrong: 'Raté' }[result];
        verdict = h('div', { class: `verdict ${result}`, role: 'status' }, h('strong', text), typed.trim() && result !== 'correct' ? h('span', ' Ta réponse : ', h('q', typed.trim())) : null);
      }
      stage.replaceChildren(h('article.bristol.study-card.revealed', cardFace(question, { size: 'large' }), h('hr.fold'), verdict, cardFace(answer, { size: 'large' })));
      if (keepControls) return;
      if (result) {
        const ok = result !== 'wrong';
        controls.replaceChildren(
          h(
            'div.button-row',
            ok ? h('button.btn', { type: 'button', onclick: () => grade(false) }, 'Compter comme raté') : h('button.btn', { type: 'button', onclick: () => grade(true) }, 'J’avais juste'),
            h('button.btn.primary', { type: 'button', onclick: () => grade(ok) }, 'Continuer', h('kbd', 'Entrée')),
          ),
        );
        controls.querySelector('.btn.primary')?.focus({ preventScroll: true });
      } else {
        controls.replaceChildren(
          h(
            'div.ratings.two',
            h('button.rate.again', { type: 'button', onclick: () => grade(false) }, h('span.rate-label', 'Pas encore'), h('kbd', '1')),
            h('button.rate.good', { type: 'button', onclick: () => grade(true) }, h('span.rate-label', 'Je savais'), h('kbd', '2')),
          ),
        );
      }
    };

    const grade = (ok) => {
      if (state !== 'answer') return;
      state = 'graded';
      if (ok) known += 1;
      else {
        current.misses += 1;
        // Revient 3 à 5 cartes plus loin.
        const at = Math.min(queue.length, 3 + Math.floor(Math.random() * 3));
        queue.splice(at, 0, current);
      }
      next();
    };

    const finish = () => {
      cleanupKeys();
      const missed = items.filter((i) => i.misses > 0);
      const firstTry = total - missed.length;
      stage.replaceChildren(
        h(
          'div.study-message.done',
          h('h2', 'Entraînement terminé'),
          h('dl.done-stats', h('div', h('dt', 'Du premier coup'), h('dd', `${firstTry} / ${total}`)), h('div', h('dt', 'À retravailler'), h('dd', String(missed.length)))),
          missed.length ? h('ul.missed-list', missed.slice(0, 12).map((m) => h('li', h('span.clip', mathToPlain(sides(m)[0].text) || 'Image'), h('span.muted', `— ${mathToPlain(sides(m)[1].text) || 'image'}`)))) : h('p', 'Tout est su du premier coup. Bravo !'),
        ),
      );
      controls.replaceChildren(
        h(
          'div.button-row',
          h('button.btn', { type: 'button', onclick: () => goBack(`deck/${deckId}`) }, 'Retour au paquet'),
          missed.length ? h('button.btn.primary', { type: 'button', onclick: () => setup(missed.map((m) => m.card)) }, `Retravailler (${missed.length})`) : h('button.btn.primary', { type: 'button', onclick: () => setup() }, 'Recommencer'),
        ),
      );
    };

    const onKey = (e) => {
      if (e.target.closest?.('input, textarea') || e.ctrlKey || e.metaKey || e.altKey) return;
      if (document.querySelector('.modal-backdrop, .lightbox')) return;
      const mode = current && modeFor(current);
      if (state === 'question' && mode === 'flip' && (e.key === ' ' || e.key === 'Enter')) {
        e.preventDefault();
        reveal();
      } else if (state === 'question' && mode === 'choice' && /^[1-4]$/.test(e.key)) {
        const c = current.choices?.[Number(e.key) - 1];
        if (c) current.pick(c, c.btn);
      } else if (state === 'answer' && !current.choices && !['write'].includes(mode) && (e.key === '1' || e.key === '2')) {
        grade(e.key === '2');
      } else if (state === 'answer' && (e.key === 'Enter' || e.key === ' ') && !e.target.closest?.('button')) {
        e.preventDefault();
        controls.querySelector('.btn.primary')?.click();
      }
    };
    document.addEventListener('keydown', onKey);
    cleanupKeys = () => document.removeEventListener('keydown', onKey);
    next();
  };

  setup();

  return {
    el: screen({ title: 'Entraînement libre', subtitle: deck.name, back: `deck/${deckId}`, body, actions: [h('button.icon-btn', { type: 'button', 'aria-label': 'Changer les options', title: 'Options', onclick: () => setup() }, icon('settings'))], className: 'practice-screen' }),
    destroy: () => cleanupKeys(),
  };
}

function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
