// Page d'un dossier : ses paquets, et la révision de tout le dossier (trié ou mélangé).
import * as db from '../db.js';
import { byName, deckSummary, estimatedMemory, getSettings, todayActivity } from '../store.js';
import { confirmDialog, h, icon, modal, plural, toast } from '../ui.js';
import { navigate } from '../router.js';
import { countLabel, dueChips, emptyState, screen } from './common.js';
import { deckItem, folderSummary, nameDialog, newDeckDialog } from './home.js';

export async function folderView({ folderId }) {
  const folder = await db.getFolder(folderId);
  if (!folder) throw new Error('Ce dossier n’existe plus.');
  const [allDecks, settings] = await Promise.all([db.getDecks(), getSettings()]);
  const activity = await todayActivity(settings);
  const now = Date.now();
  const decks = allDecks.filter((d) => d.folderId === folderId).sort(byName);
  const cardsByDeck = new Map(await Promise.all(decks.map(async (d) => [d.id, await db.getCards(d.id)])));
  const sums = new Map(decks.map((d) => [d.id, deckSummary(d, cardsByDeck.get(d.id), activity.byDeck.get(d.id), settings, now)]));
  const sum = folderSummary([...sums.values()]);
  const allCards = decks.flatMap((d) => cardsByDeck.get(d.id));
  const memory = settings.algorithm !== 'sm2' ? estimatedMemory(allCards, now) : null;

  const menuBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Plus d’options', title: 'Options', onclick: () => folderMenu(folder, decks) }, icon('more'));

  // Ordre de révision du dossier : trié (paquet par paquet) ou mélangé.
  const order = orderToggle(Boolean(folder.shuffle), async (shuffle) => {
    await db.putFolder({ ...folder, shuffle });
    folder.shuffle = shuffle;
    toast(shuffle ? 'Les cartes du dossier seront mélangées.' : 'Les cartes du dossier seront révisées paquet par paquet, dans l’ordre.');
  });

  const hero = h(
    'section.deck-hero',
    h('p.deck-desc', `${plural(decks.length, 'paquet')} · ${countLabel(sum.total)}`),
    dueChips(sum.due),
    h('div.field', h('span.label', 'Ordre des cartes'), order),
    h(
      'div.deck-cta',
      h('button.btn.primary.big', { type: 'button', disabled: !sum.dueTotal, onclick: () => navigate(`folder/${folderId}/study`) }, icon('play'), sum.dueTotal ? `Réviser le dossier (${plural(sum.dueTotal, 'carte')})` : 'Rien à réviser'),
      h('button.btn.big', { type: 'button', disabled: !sum.total, onclick: () => navigate(`folder/${folderId}/practice`) }, icon('shuffle'), 'Entraînement libre'),
    ),
    h('p.muted.small', '« Réviser le dossier » suit la répétition espacée de chaque paquet. « Entraînement libre » parcourt toutes les cartes du dossier, sans changer ton planning.'),
    memory !== null ? h('p.memory-line', h('strong', `${Math.round(memory * 100)} %`), ' : chances moyennes de te souvenir aujourd’hui des cartes déjà étudiées (estimation FSRS).') : null,
  );

  const decksSection = decks.length
    ? h(
        'section.cards-section',
        h(
          'div.section-head',
          h('h2', plural(decks.length, 'paquet')),
          h(
            'div.button-row.left',
            h('button.btn.small', { type: 'button', onclick: () => moveDecksDialog(folder, allDecks) }, icon('move'), 'Ranger des paquets ici'),
            h('button.btn.small', { type: 'button', onclick: () => newDeckDialog({ folderId }) }, icon('plus'), 'Nouveau paquet'),
          ),
        ),
        h('ul.deck-list', decks.map((d) => deckItem(d, sums.get(d.id), now))),
      )
    : emptyState({
        title: 'Ce dossier est vide',
        text: 'Crée un paquet directement ici, ou range dans ce dossier des paquets que tu as déjà.',
        actions: [
          h('button.btn.primary', { type: 'button', onclick: () => newDeckDialog({ folderId }) }, icon('plus'), 'Nouveau paquet'),
          allDecks.some((d) => d.folderId !== folderId) ? h('button.btn', { type: 'button', onclick: () => moveDecksDialog(folder, allDecks) }, icon('move'), 'Ranger des paquets ici') : null,
        ],
      });

  return { el: screen({ title: folder.name, subtitle: 'Dossier', back: '', actions: [menuBtn], body: [decks.length ? hero : null, decksSection], className: 'folder' }) };
}

/** Bascule « Trié / Mélangé ». */
export function orderToggle(shuffle, onChange) {
  const group = h('div.segmented', { role: 'radiogroup', 'aria-label': 'Ordre des cartes' });
  const paint = () => {
    for (const b of group.children) b.setAttribute('aria-checked', String((b.dataset.id === 'shuffle') === shuffle));
  };
  for (const [id, label] of [['sorted', 'Trié'], ['shuffle', 'Mélangé']]) {
    group.append(
      h('button', {
        type: 'button',
        role: 'radio',
        dataset: { id },
        onclick: () => {
          const next = id === 'shuffle';
          if (next === shuffle) return;
          shuffle = next;
          paint();
          onChange(shuffle);
        },
      }, label),
    );
  }
  paint();
  return group;
}

function folderMenu(folder, decks) {
  const item = (iconName, label, onClick, cls = '') =>
    h('button.menu-item', { type: 'button', class: cls, onclick: () => { dlg.close(); onClick(); } }, icon(iconName), label);
  const dlg = modal({
    title: folder.name,
    body: h(
      'div.menu',
      item('edit', 'Renommer le dossier', () =>
        nameDialog({
          title: 'Renommer le dossier',
          label: 'Nom du dossier',
          value: folder.name,
          confirm: 'Renommer',
          onSubmit: async (name) => {
            await db.putFolder({ ...folder, name });
            toast('Dossier renommé.');
            navigate(`folder/${folder.id}`, { replace: true });
          },
        }),
      ),
      item('trash', 'Supprimer le dossier', async () => {
        const ok = await confirmDialog({
          title: 'Supprimer ce dossier ?',
          message: decks.length
            ? `Le dossier « ${folder.name} » sera supprimé. Ses ${plural(decks.length, 'paquet')} ne sont pas supprimés : ils reviennent sur l’accueil.`
            : `Le dossier « ${folder.name} » sera supprimé.`,
          confirmLabel: 'Supprimer le dossier',
          danger: true,
        });
        if (!ok) return;
        await db.deleteFolder(folder.id);
        toast('Dossier supprimé.');
        navigate('', { replace: true });
      }, 'danger'),
    ),
  });
}

/** Choisir les paquets à ranger dans ce dossier. */
function moveDecksDialog(folder, allDecks) {
  const candidates = allDecks.filter((d) => d.folderId !== folder.id).sort(byName);
  if (!candidates.length) {
    toast('Tous tes paquets sont déjà dans ce dossier.');
    return;
  }
  const checks = candidates.map((d) => ({ deck: d, input: h('input', { type: 'checkbox', id: `move-${d.id}` }) }));
  modal({
    title: `Ranger dans « ${folder.name} »`,
    body: [
      h('p.small.muted', 'Coche les paquets à déplacer dans ce dossier.'),
      h('div.check-list', checks.map(({ deck, input }) => h('label.check', input, h('span', deck.name)))),
    ],
    actions: [
      { label: 'Annuler', value: false },
      {
        label: 'Ranger',
        kind: 'primary',
        onClick: async () => {
          const chosen = checks.filter((c) => c.input.checked).map((c) => c.deck);
          if (!chosen.length) {
            toast('Coche au moins un paquet.');
            return false;
          }
          for (const d of chosen) await db.putDeck({ ...d, folderId: folder.id });
          toast(`${plural(chosen.length, 'paquet')} rangé${chosen.length > 1 ? 's' : ''} dans « ${folder.name} ».`);
          navigate(`folder/${folder.id}`, { replace: true });
          return true;
        },
      },
    ],
  });
}
