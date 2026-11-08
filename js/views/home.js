import * as db from '../db.js';
import { createDeck, createSampleDeck, deckSummary, getSettings, todayActivity } from '../store.js';
import { h, icon, modal, plural, toast } from '../ui.js';
import { navigate } from '../router.js';
import { countLabel, dueChips, emptyState, screen } from './common.js';
import { formatDuration } from '../srs.js';

export async function homeView() {
  const [decks, cards, settings] = await Promise.all([db.getDecks(), db.getAllCards(), getSettings()]);
  const activity = await todayActivity(settings);
  const now = Date.now();
  const byDeck = new Map(decks.map((d) => [d.id, []]));
  for (const c of cards) byDeck.get(c.deckId)?.push(c);

  const summaries = decks
    .map((d) => ({ deck: d, sum: deckSummary(d, byDeck.get(d.id) || [], activity.byDeck.get(d.id), settings, now) }))
    .sort((a, b) => b.sum.dueTotal - a.sum.dueTotal || (b.deck.updatedAt || 0) - (a.deck.updatedAt || 0));

  const totalDue = summaries.reduce((n, s) => n + s.sum.dueTotal, 0);

  const actions = [
    h('button.icon-btn', { type: 'button', 'aria-label': 'Importer', title: 'Importer', onclick: () => navigate('import') }, icon('import')),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Réglages', title: 'Réglages', onclick: () => navigate('settings') }, icon('settings')),
  ];

  let body;
  if (!decks.length) {
    body = emptyState({
      title: 'Aucun paquet pour l’instant',
      text: 'Crée un paquet de cartes, ou récupère tes sets Quizlet en quelques secondes.',
      actions: [
        h('button.btn.primary', { type: 'button', onclick: () => newDeckDialog() }, icon('plus'), 'Nouveau paquet'),
        h('button.btn', { type: 'button', onclick: () => navigate('import') }, icon('import'), 'Importer depuis Quizlet'),
        h('button.btn.ghost', {
          type: 'button',
          onclick: async () => {
            const d = await createSampleDeck();
            navigate(`deck/${d.id}`);
          },
        }, 'Essayer avec un paquet d’exemple'),
      ],
    });
  } else {
    body = [
      h(
        'section.today',
        h('p.today-label', 'Aujourd’hui'),
        h('p.today-figure', totalDue ? plural(totalDue, 'carte') + ' à étudier' : 'Tout est à jour'),
        h('p.today-sub', activity.total ? `${plural(activity.total, 'réponse')} donnée${activity.total > 1 ? 's' : ''} depuis ce matin` : 'Pas encore de révision aujourd’hui'),
      ),
      h(
        'ul.deck-list',
        summaries.map(({ deck, sum }) =>
          h(
            'li.deck-item',
            h(
              'button.deck-open',
              { type: 'button', onclick: () => navigate(`deck/${deck.id}`) },
              h('span.deck-name', deck.name),
              h('span.deck-meta', countLabel(sum.total), sum.dueTotal === 0 && sum.nextDue !== Infinity && sum.nextDue > now ? ` · prochaine révision dans ${formatDuration(sum.nextDue - now)}` : ''),
              dueChips(sum.due, { compact: true }),
            ),
            h(
              'button.btn.study-btn',
              {
                type: 'button',
                class: sum.dueTotal ? 'primary' : '',
                disabled: !sum.dueTotal,
                onclick: () => navigate(`deck/${deck.id}/study`),
                'aria-label': sum.dueTotal ? `Réviser ${deck.name}` : `${deck.name} est à jour`,
              },
              sum.dueTotal ? 'Réviser' : 'À jour',
            ),
          ),
        ),
      ),
      h('div.fab-row', h('button.btn.primary.fab', { type: 'button', onclick: () => newDeckDialog() }, icon('plus'), 'Nouveau paquet')),
    ];
  }

  return { el: screen({ title: 'Mnémo', actions, body, className: 'home' }) };
}

export function newDeckDialog() {
  const input = h('input.input', { id: 'new-deck-name', type: 'text', placeholder: 'Ex. : Vocabulaire anglais – Unité 3', maxlength: 120, autocomplete: 'off' });
  const submit = async () => {
    const name = input.value.trim();
    if (!name) {
      input.focus();
      toast('Donne un nom au paquet.');
      return false;
    }
    const deck = await createDeck(name);
    // Passe par la page du paquet pour que « Retour » / « Terminer » y ramène.
    navigate(`deck/${deck.id}`);
    navigate(`deck/${deck.id}/card/new`);
    return true;
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit().then((ok) => ok && dlg.close(true));
    }
  });
  const dlg = modal({
    title: 'Nouveau paquet',
    body: h('label.field', h('span.label', 'Nom du paquet'), input),
    actions: [
      { label: 'Annuler', value: false },
      { label: 'Créer', kind: 'primary', onClick: submit },
    ],
  });
}
