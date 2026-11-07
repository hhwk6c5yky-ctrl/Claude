import * as db from '../db.js';
import { DECK_DEFAULTS, getPrefs, getSettings, recordAnswer, savePrefs, todayActivity, undoAnswer } from '../store.js';
import { StudySession } from '../session.js';
import { Rating, formatDuration, previewIntervals } from '../srs.js';
import { checkAnswer } from '../answer.js';
import { h, icon, plural, toast } from '../ui.js';
import { goBack, navigate } from '../router.js';
import { cardFace, screen } from './common.js';

const RATINGS = [
  { value: Rating.Again, label: 'À revoir', key: '1', cls: 'again' },
  { value: Rating.Hard, label: 'Difficile', key: '2', cls: 'hard' },
  { value: Rating.Good, label: 'Correct', key: '3', cls: 'good' },
  { value: Rating.Easy, label: 'Facile', key: '4', cls: 'easy' },
];

export async function studyView({ deckId }) {
  const deck = await db.getDeck(deckId);
  if (!deck) throw new Error('Ce paquet n’existe plus.');
  const [cards, settings, prefs] = await Promise.all([db.getCards(deckId), getSettings(), getPrefs()]);
  const activity = await todayActivity(settings);
  const done = activity.byDeck.get(deckId) || { fresh: 0, review: 0 };

  let typeAnswer = prefs.typeAnswer;
  const startedAt = Date.now();
  const tally = { total: 0, again: 0 };
  const undoStack = [];
  let session;
  let current = null;
  let revealed = false;
  let typed = '';
  let waitTimer = null;
  let busy = false;

  const build = (newLimit = Math.max(0, (deck.newPerDay ?? DECK_DEFAULTS.newPerDay) - done.fresh)) => {
    session = new StudySession(cards, {
      now: Date.now(),
      newLimit,
      reviewLimit: Math.max(0, (deck.reviewsPerDay ?? DECK_DEFAULTS.reviewsPerDay) - done.review),
      settings,
    });
  };
  build();

  // ---------- Interface ----------
  const counts = h('div.chips.study-counts', { 'aria-live': 'off' });
  const stage = h('div.study-stage');
  const controls = h('div.study-controls');

  const undoBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Annuler la dernière réponse', title: 'Annuler (Z)', disabled: true, onclick: () => undo() }, icon('undo'));
  const editBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Modifier cette carte', title: 'Modifier (E)', disabled: true, onclick: () => current && navigate(`deck/${deckId}/card/${current.card.id}`) }, icon('edit'));
  const typeBtn = h('button.icon-btn.toggle', {
    type: 'button',
    'aria-label': 'Écrire la réponse avant de la voir',
    title: 'Écrire la réponse',
    'aria-pressed': String(typeAnswer),
    onclick: () => {
      typeAnswer = !typeAnswer;
      typeBtn.setAttribute('aria-pressed', String(typeAnswer));
      savePrefs({ typeAnswer });
      toast(typeAnswer ? 'Mode écriture activé : tape ta réponse avant de la voir.' : 'Mode écriture désactivé.');
      if (current && !revealed) renderQuestion();
    },
  }, icon('keyboard'));

  const updateCounts = () => {
    const c = session.counts(Date.now());
    const q = current?.queue;
    counts.replaceChildren(
      h('span', { class: `chip new${q === 'new' ? ' current' : ''}`, title: 'Nouvelles' }, String(c.fresh)),
      h('span', { class: `chip learn${q === 'learn' ? ' current' : ''}`, title: 'En cours' }, String(c.learn)),
      h('span', { class: `chip review${q === 'review' ? ' current' : ''}`, title: 'À réviser' }, String(c.review)),
    );
    undoBtn.disabled = !undoStack.length;
    editBtn.disabled = !current;
  };

  const show = () => {
    clearInterval(waitTimer);
    const next = session.next(Date.now());
    if (!next) return renderDone();
    if (next.wait) return renderWait(next);
    current = next;
    revealed = false;
    typed = '';
    renderQuestion();
  };

  const canType = () => typeAnswer && Boolean(current?.card.back.text?.trim());

  const renderQuestion = () => {
    updateCounts();
    const card = current.card;
    const sheet = h('article.bristol.study-card', { 'aria-label': 'Question' }, cardFace(card.front, { size: 'large' }));
    sheet.addEventListener('click', (e) => {
      if (!e.target.closest('input, button, .zoomable')) reveal();
    });
    stage.replaceChildren(sheet);
    if (canType()) {
      const input = h('input.input.type-answer', { id: 'typed-answer', type: 'text', placeholder: 'Ta réponse…', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, enterkeyhint: 'done' });
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          typed = input.value;
          reveal();
        }
      });
      controls.replaceChildren(
        h('label.sr-only', { for: 'typed-answer' }, 'Ta réponse'),
        input,
        h('button.btn.primary.big.wide', { type: 'button', onclick: () => { typed = input.value; reveal(); } }, 'Vérifier'),
      );
      setTimeout(() => input.focus(), 30);
    } else {
      controls.replaceChildren(h('button.btn.primary.big.wide.reveal-btn', { type: 'button', onclick: reveal }, 'Afficher la réponse', h('kbd', 'Espace')));
    }
  };

  const reveal = () => {
    if (!current || revealed) return;
    revealed = true;
    const card = current.card;
    let verdict = null;
    let suggested = null;
    if (canType()) {
      const result = checkAnswer(typed, card.back.text);
      suggested = result === 'correct' ? Rating.Good : result === 'close' ? Rating.Hard : Rating.Again;
      const text = { correct: 'Bonne réponse', close: 'Presque : vérifie l’orthographe ou les accents', wrong: typed.trim() ? 'Pas tout à fait' : 'Pas de réponse' }[result];
      verdict = h('div', { class: `verdict ${result}`, role: 'status' }, h('strong', text), typed.trim() && result !== 'correct' ? h('span', ' Ta réponse : ', h('q', typed.trim())) : null);
    }
    const sheet = h(
      'article.bristol.study-card.revealed',
      { 'aria-label': 'Question et réponse' },
      cardFace(card.front, { size: 'large' }),
      h('hr.fold'),
      verdict,
      cardFace(card.back, { size: 'large' }),
    );
    stage.replaceChildren(sheet);
    const previews = previewIntervals(card.srs, Date.now(), settings);
    controls.replaceChildren(
      h(
        'div.ratings',
        { role: 'group', 'aria-label': 'Comment as-tu répondu ?' },
        RATINGS.map((r) =>
          h(
            'button.rate',
            { type: 'button', class: `${r.cls}${suggested === r.value ? ' suggested' : ''}`, onclick: () => rate(r.value), 'aria-label': `${r.label}, prochaine révision dans ${previews[r.value]}` },
            h('span.rate-when', previews[r.value]),
            h('span.rate-label', r.label),
            h('kbd', r.key),
          ),
        ),
      ),
    );
    controls.querySelector('.rate.suggested, .rate.good')?.focus({ preventScroll: true });
  };

  const rate = async (rating) => {
    if (!current || !revealed || busy) return;
    busy = true;
    try {
      const before = current.card;
      const after = session.answer(before, rating, Date.now());
      const logId = await recordAnswer(before, after, rating);
      undoStack.push({ before, logId });
      if (undoStack.length > 20) undoStack.shift();
      tally.total += 1;
      if (rating === Rating.Again) tally.again += 1;
      current = null;
      show();
    } catch (err) {
      toast(err?.message || 'Impossible d’enregistrer la réponse.');
    } finally {
      busy = false;
    }
  };

  const undo = async () => {
    const last = undoStack.pop();
    if (!last || busy) return;
    busy = true;
    try {
      session.undo();
      await undoAnswer(last.before, last.logId);
      tally.total = Math.max(0, tally.total - 1);
      current = { card: last.before, queue: queueOf(last.before) };
      revealed = false;
      typed = '';
      clearInterval(waitTimer);
      renderQuestion();
      toast('Réponse annulée.');
    } finally {
      busy = false;
    }
  };

  const renderWait = (next) => {
    current = null;
    updateCounts();
    const label = h('strong');
    const tick = () => {
      const ms = next.card.srs.due - Date.now();
      if (ms <= session.learnAheadMs) {
        show();
        return;
      }
      label.textContent = formatDuration(ms - session.learnAheadMs);
    };
    stage.replaceChildren(
      h(
        'div.study-message',
        h('h2', 'Pause'),
        h('p', `${plural(session.learn.length, 'carte')} en cours d’apprentissage ${session.learn.length > 1 ? 'reviendront' : 'reviendra'} bientôt. La suivante sera prête dans `, label, '.'),
        h('p.muted.small', 'Tu peux laisser cet écran ouvert ou revenir plus tard : rien n’est perdu.'),
      ),
    );
    controls.replaceChildren(
      h('div.button-row', h('button.btn', { type: 'button', onclick: () => goBack(`deck/${deckId}`) }, 'Terminer pour l’instant'), h('button.btn.primary', { type: 'button', onclick: () => { current = { card: next.card, queue: 'learn' }; revealed = false; typed = ''; clearInterval(waitTimer); renderQuestion(); } }, 'Revoir maintenant')),
    );
    tick();
    waitTimer = setInterval(tick, 1000);
  };

  const renderDone = async () => {
    current = null;
    updateCounts();
    const minutes = Math.max(1, Math.round((Date.now() - startedAt) / 60000));
    const fresh = await db.getCards(deckId);
    const leftNew = fresh.filter((c) => c.srs.state === 'new').length;
    const success = tally.total ? Math.round(((tally.total - tally.again) / tally.total) * 100) : null;
    stage.replaceChildren(
      h(
        'div.study-message.done',
        h('h2', tally.total ? 'Séance terminée' : 'Rien à réviser pour le moment'),
        tally.total
          ? h('dl.done-stats', h('div', h('dt', 'Cartes'), h('dd', String(tally.total))), h('div', h('dt', 'Réussite'), h('dd', `${success} %`)), h('div', h('dt', 'Durée'), h('dd', `${minutes} min`)))
          : h('p', 'Reviens plus tard, ou entraîne-toi librement sur tout le paquet.'),
        leftNew ? h('p.muted.small', `${plural(leftNew, 'nouvelle carte')} pas encore vue${leftNew > 1 ? 's' : ''} dans ce paquet.`) : null,
      ),
    );
    const buttons = [h('button.btn', { type: 'button', onclick: () => goBack(`deck/${deckId}`) }, 'Retour au paquet')];
    if (leftNew) {
      buttons.push(
        h('button.btn.primary', {
          type: 'button',
          onclick: async () => {
            // Dépasse la limite du jour : utile avant un contrôle.
            cards.splice(0, cards.length, ...(await db.getCards(deckId)));
            build(10);
            show();
          },
        }, `Étudier ${Math.min(10, leftNew)} nouvelles cartes de plus`),
      );
    } else {
      buttons.push(h('button.btn.primary', { type: 'button', onclick: () => navigate(`deck/${deckId}/practice`, { replace: true }) }, 'Entraînement libre'));
    }
    controls.replaceChildren(h('div.button-row', buttons));
  };

  const onKey = (e) => {
    if (e.target.closest?.('input, textarea, select') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (document.querySelector('.modal-backdrop, .lightbox')) return;
    if (!revealed && current && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      reveal();
    } else if (revealed && current && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      rate(Number(e.key));
    } else if (revealed && current && (e.key === ' ' || e.key === 'Enter') && !e.target.closest?.('button')) {
      e.preventDefault();
      rate(Rating.Good);
    } else if (e.key === 'z' || e.key === 'Z') {
      undo();
    } else if ((e.key === 'e' || e.key === 'E') && current) {
      navigate(`deck/${deckId}/card/${current.card.id}`);
    }
  };
  document.addEventListener('keydown', onKey);

  const el = screen({
    title: deck.name,
    back: `deck/${deckId}`,
    actions: [typeBtn, editBtn, undoBtn],
    body: h('div.study', counts, stage, controls),
    className: 'study-screen',
  });
  show();

  return {
    el,
    destroy: () => {
      clearInterval(waitTimer);
      document.removeEventListener('keydown', onKey);
    },
  };
}

function queueOf(card) {
  if (card.srs.state === 'new') return 'new';
  if (card.srs.state === 'review') return 'review';
  return 'learn';
}
