import * as db from '../db.js';
import { byName, createDeck, createFolder, createSampleDeck, deckSummary, getSettings, todayActivity } from '../store.js';
import { h, icon, modal, plural, toast } from '../ui.js';
import { navigate } from '../router.js';
import { countLabel, dueChips, emptyState, screen, syncBadge } from './common.js';
import { formatDuration } from '../srs.js';

export async function homeView() {
  const [folders, decks, cards, settings] = await Promise.all([db.getFolders(), db.getDecks(), db.getAllCards(), getSettings()]);
  const activity = await todayActivity(settings);
  const now = Date.now();
  const byDeck = new Map(decks.map((d) => [d.id, []]));
  for (const c of cards) byDeck.get(c.deckId)?.push(c);
  const sums = new Map(decks.map((d) => [d.id, deckSummary(d, byDeck.get(d.id) || [], activity.byDeck.get(d.id), settings, now)]));

  // Un paquet dont le dossier a disparu (supprimé sur un autre appareil) revient à l'accueil.
  const folderIds = new Set(folders.map((f) => f.id));
  const rootDecks = decks
    .filter((d) => !d.folderId || !folderIds.has(d.folderId))
    .sort((a, b) => sums.get(b.id).dueTotal - sums.get(a.id).dueTotal || byName(a, b));
  const folderItems = [...folders].sort(byName).map((f) => {
    const inside = decks.filter((d) => d.folderId === f.id);
    return { folder: f, decks: inside, sum: folderSummary(inside.map((d) => sums.get(d.id))) };
  });

  const totalDue = [...sums.values()].reduce((n, s) => n + s.dueTotal, 0);

  const actions = [
    syncBadge(),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Importer', title: 'Importer', onclick: () => navigate('import') }, icon('import')),
    h('button.icon-btn', { type: 'button', 'aria-label': 'Réglages', title: 'Réglages', onclick: () => navigate('settings') }, icon('settings')),
  ];

  let body;
  if (!decks.length && !folders.length) {
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
      folderItems.length
        ? h(
            'section.list-section',
            h('h2.list-title', 'Dossiers'),
            h('ul.deck-list', folderItems.map(({ folder, decks: inside, sum }) => folderItem(folder, inside.length, sum))),
          )
        : null,
      rootDecks.length
        ? h(
            'section.list-section',
            folderItems.length ? h('h2.list-title', 'Paquets') : null,
            h('ul.deck-list', rootDecks.map((d) => deckItem(d, sums.get(d.id), now))),
          )
        : null,
      h(
        'div.fab-row',
        h('button.btn.fab.secondary', { type: 'button', onclick: () => newFolderDialog() }, icon('folder'), 'Nouveau dossier'),
        h('button.btn.primary.fab', { type: 'button', onclick: () => newDeckDialog() }, icon('plus'), 'Nouveau paquet'),
      ),
    ];
  }

  return { el: screen({ title: 'Mnémo', actions, body, className: 'home' }) };
}

/** Totaux d'un dossier à partir des résumés de ses paquets. */
export function folderSummary(sums) {
  const due = { fresh: 0, learn: 0, review: 0 };
  let total = 0;
  for (const s of sums) {
    due.fresh += s.due.fresh;
    due.learn += s.due.learn;
    due.review += s.due.review;
    total += s.total;
  }
  return { due, total, dueTotal: due.fresh + due.learn + due.review };
}

export function deckItem(deck, sum, now = Date.now()) {
  return h(
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
  );
}

function folderItem(folder, deckCount, sum) {
  return h(
    'li.deck-item.folder-item',
    h(
      'button.deck-open',
      { type: 'button', onclick: () => navigate(`folder/${folder.id}`) },
      h('span.deck-name', h('span.folder-icon', icon('folder')), folder.name),
      h('span.deck-meta', `${plural(deckCount, 'paquet')} · ${countLabel(sum.total)}`),
      dueChips(sum.due, { compact: true }),
    ),
    h(
      'button.btn.study-btn',
      {
        type: 'button',
        class: sum.dueTotal ? 'primary' : '',
        disabled: !sum.dueTotal,
        onclick: () => navigate(`folder/${folder.id}/study`),
        'aria-label': sum.dueTotal ? `Réviser le dossier ${folder.name}` : `${folder.name} est à jour`,
      },
      sum.dueTotal ? 'Réviser' : 'À jour',
    ),
  );
}

/** Boîte « nom » réutilisée pour créer ou renommer un paquet ou un dossier. */
export function nameDialog({ id = 'name-input', title, label, placeholder = '', value = '', confirm = 'Créer', onSubmit }) {
  const input = h('input.input', { id, type: 'text', placeholder, value, maxlength: 120, autocomplete: 'off' });
  const submit = async () => {
    const name = input.value.trim();
    if (!name) {
      input.focus();
      toast('Donne-lui un nom.');
      return false;
    }
    await onSubmit(name);
    return true;
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit().then((ok) => ok && dlg.close(true));
    }
  });
  const dlg = modal({
    title,
    body: h('label.field', h('span.label', label), input),
    actions: [
      { label: 'Annuler', value: false },
      { label: confirm, kind: 'primary', onClick: submit },
    ],
  });
  input.select();
}

/** Nouveau paquet (dans un dossier si `folderId` est donné). */
export function newDeckDialog({ folderId = null } = {}) {
  nameDialog({
    id: 'new-deck-name',
    title: 'Nouveau paquet',
    label: 'Nom du paquet',
    placeholder: 'Ex. : Vocabulaire anglais – Unité 3',
    onSubmit: async (name) => {
      const deck = await createDeck(name, folderId ? { folderId } : {});
      // Passe par la page du paquet pour que « Retour » / « Terminer » y ramène.
      navigate(`deck/${deck.id}`);
      navigate(`deck/${deck.id}/card/new`);
    },
  });
}

export function newFolderDialog() {
  nameDialog({
    id: 'new-folder-name',
    title: 'Nouveau dossier',
    label: 'Nom du dossier',
    placeholder: 'Ex. : Bac de maths, Anglais…',
    onSubmit: async (name) => {
      const folder = await createFolder(name);
      navigate(`folder/${folder.id}`);
    },
  });
}
