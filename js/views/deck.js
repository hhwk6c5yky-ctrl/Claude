import * as db from '../db.js';
import { DECK_DEFAULTS, deckSummary, getSettings, resetProgress, todayActivity } from '../store.js';
import { confirmDialog, h, icon, modal, plural, toast } from '../ui.js';
import { navigate } from '../router.js';
import { countLabel, dueChips, emptyState, screen, sideSnippet, stateLabel } from './common.js';
import { buildBackup, backupFileName, saveFile } from '../backup.js';
import { toTsv } from '../importer.js';
import { forgetImage } from '../images.js';
import { formatDuration } from '../srs.js';

export async function deckView({ deckId }) {
  const deck = await db.getDeck(deckId);
  if (!deck) throw new Error('Ce paquet n’existe plus.');
  const [cards, settings] = await Promise.all([db.getCards(deckId), getSettings()]);
  const activity = await todayActivity(settings);
  const now = Date.now();
  const sum = deckSummary(deck, cards, activity.byDeck.get(deckId), settings, now);
  cards.sort((a, b) => (a.position ?? a.createdAt) - (b.position ?? b.createdAt));

  const menuBtn = h('button.icon-btn', { type: 'button', 'aria-label': 'Plus d’options', title: 'Options', onclick: () => deckMenu(deck, cards) }, icon('more'));

  const studyLabel = sum.dueTotal ? `Réviser ${plural(sum.dueTotal, 'carte')}` : 'Rien à réviser';
  let nextInfo = null;
  if (!sum.dueTotal && cards.length) {
    nextInfo = sum.nextDue !== Infinity && sum.nextDue > now
      ? `Prochaine révision dans ${formatDuration(sum.nextDue - now)}. Tu peux t’entraîner librement en attendant.`
      : 'Limite de nouvelles cartes atteinte pour aujourd’hui.';
  }

  const hero = h(
    'section.deck-hero',
    deck.description ? h('p.deck-desc', deck.description) : null,
    dueChips(sum.due),
    h(
      'div.deck-cta',
      h('button.btn.primary.big', { type: 'button', disabled: !sum.dueTotal, onclick: () => navigate(`deck/${deckId}/study`) }, icon('play'), studyLabel),
      h('button.btn.big', { type: 'button', disabled: !cards.length, onclick: () => navigate(`deck/${deckId}/practice`) }, icon('shuffle'), 'Entraînement libre'),
    ),
    nextInfo ? h('p.muted.small', nextInfo) : null,
    cards.length ? progressBar(sum) : null,
  );

  const list = h('ul.card-list');
  const search = h('input.input.search', { id: 'card-search', type: 'search', placeholder: 'Rechercher une carte', 'aria-label': 'Rechercher une carte', autocomplete: 'off' });
  const renderList = () => {
    const q = search.value.trim().toLowerCase();
    const shown = q ? cards.filter((c) => `${c.front.text}\n${c.back.text}`.toLowerCase().includes(q)) : cards;
    list.replaceChildren(
      ...shown.slice(0, 500).map((c) => {
        const st = stateLabel(c.srs, now);
        return h(
          'li',
          h(
            'button.card-row',
            { type: 'button', onclick: () => navigate(`deck/${deckId}/card/${c.id}`) },
            h('span.card-row-side', c.front.imageId ? h('span.thumb-dot', { title: 'Contient une image' }, icon('image')) : null, h('span.clip', sideSnippet(c.front))),
            h('span.card-row-side.back', c.back.imageId ? h('span.thumb-dot', { title: 'Contient une image' }, icon('image')) : null, h('span.clip', sideSnippet(c.back))),
            h('span', { class: `state state-${st.cls}` }, st.text),
          ),
        );
      }),
    );
    if (!shown.length) list.append(h('li.muted.small.list-empty', q ? 'Aucune carte ne correspond.' : ''));
    if (shown.length > 500) list.append(h('li.muted.small.list-empty', `… et ${shown.length - 500} autres. Affine ta recherche.`));
  };
  search.addEventListener('input', renderList);
  renderList();

  const cardsSection = cards.length
    ? h(
        'section.cards-section',
        h(
          'div.section-head',
          h('h2', countLabel(cards.length)),
          h('button.btn.small', { type: 'button', onclick: () => navigate(`deck/${deckId}/card/new`) }, icon('plus'), 'Ajouter'),
        ),
        cards.length > 6 ? search : null,
        list,
      )
    : emptyState({
        title: 'Ce paquet est vide',
        text: 'Ajoute des cartes une par une (avec des photos si tu veux) ou importe un set Quizlet.',
        actions: [
          h('button.btn.primary', { type: 'button', onclick: () => navigate(`deck/${deckId}/card/new`) }, icon('plus'), 'Ajouter une carte'),
          h('button.btn', { type: 'button', onclick: () => navigate(`import/${deckId}`) }, icon('import'), 'Importer'),
        ],
      });

  return { el: screen({ title: deck.name, back: '', actions: [menuBtn], body: [hero, cardsSection], className: 'deck' }) };
}

function progressBar(sum) {
  const total = sum.total || 1;
  const seg = (n, cls, label) => (n ? h('span', { class: `seg ${cls}`, style: { flexGrow: String(n) }, title: `${label} : ${n}` }) : null);
  return h(
    'div.progress-block',
    h('div.progress', { role: 'img', 'aria-label': `${sum.mature} acquises, ${sum.young} en révision, ${sum.learning} en cours, ${sum.fresh} nouvelles` },
      seg(sum.mature, 'mature', 'Acquises'),
      seg(sum.young, 'young', 'En révision'),
      seg(sum.learning, 'learn', 'En cours'),
      seg(sum.fresh, 'new', 'Nouvelles'),
    ),
    h(
      'dl.legend',
      legend('mature', 'Acquises', sum.mature, total),
      legend('young', 'En révision', sum.young, total),
      legend('learn', 'En cours', sum.learning, total),
      legend('new', 'Jamais vues', sum.fresh, total),
    ),
  );
}

function legend(cls, label, n, total) {
  return h('div', h('dt', h('span', { class: `dot ${cls}` }), label), h('dd', `${n}`, h('small', ` · ${Math.round((n / total) * 100)} %`)));
}

function deckMenu(deck, cards) {
  const item = (iconName, label, onClick, cls = '') =>
    h('button.menu-item', { type: 'button', class: cls, onclick: () => { dlg.close(); onClick(); } }, icon(iconName), label);
  const dlg = modal({
    title: deck.name,
    body: h(
      'div.menu',
      item('edit', 'Renommer et réglages du paquet', () => deckSettingsDialog(deck)),
      item('import', 'Importer des cartes dans ce paquet', () => navigate(`import/${deck.id}`)),
      item('export', 'Sauvegarder ce paquet (avec images)', async () => {
        try {
          const data = await buildBackup([deck.id]);
          const res = await saveFile(backupFileName(deck.name), JSON.stringify(data));
          if (res !== 'cancelled') toast('Sauvegarde du paquet créée.');
        } catch (err) {
          toast(err?.message || 'La sauvegarde a échoué.');
        }
      }),
      item('export', 'Copier au format texte (Quizlet / Anki)', async () => copyAsText(cards)),
      item('undo', 'Remettre la progression à zéro', async () => {
        if (await confirmDialog({ title: 'Remettre à zéro ?', message: `Les ${plural(cards.length, 'carte')} redeviendront « nouvelles ». Le contenu des cartes est conservé.`, confirmLabel: 'Remettre à zéro', danger: true })) {
          await resetProgress(deck.id);
          toast('Progression remise à zéro.');
          navigate(`deck/${deck.id}`, { replace: true });
        }
      }),
      item('trash', 'Supprimer le paquet', async () => {
        if (await confirmDialog({ title: 'Supprimer ce paquet ?', message: `« ${deck.name} » et ses ${plural(cards.length, 'carte')} seront supprimés définitivement de cet appareil.`, confirmLabel: 'Supprimer', danger: true })) {
          for (const c of cards) for (const id of db.imageIds(c)) forgetImage(id);
          await db.deleteDeck(deck.id);
          toast('Paquet supprimé.');
          navigate('', { replace: true });
        }
      }, 'danger'),
    ),
  });
}

async function copyAsText(cards) {
  const text = toTsv(cards.map((c) => ({ front: c.front.text, back: c.back.text })));
  try {
    await navigator.clipboard.writeText(text);
    toast(`${plural(cards.length, 'carte')} copiée${cards.length > 1 ? 's' : ''} (terme ⇥ définition). Les images ne sont pas incluses.`);
  } catch {
    const area = h('textarea.input.mono', { id: 'export-text', rows: 10, readonly: true }, text);
    modal({ title: 'Texte à copier', body: [h('p.small.muted', 'Sélectionne tout le texte puis copie-le.'), area], actions: [{ label: 'Fermer', kind: 'primary' }] });
    area.select();
  }
}

function deckSettingsDialog(deck) {
  const name = h('input.input', { id: 'deck-name', type: 'text', value: deck.name, maxlength: 120 });
  const desc = h('textarea.input', { id: 'deck-desc', rows: 2, maxlength: 400, placeholder: 'Facultatif' }, deck.description || '');
  const perDay = h('input.input', { id: 'deck-new-per-day', type: 'number', min: 0, max: 9999, inputmode: 'numeric', value: String(deck.newPerDay ?? DECK_DEFAULTS.newPerDay) });
  const reviews = h('input.input', { id: 'deck-reviews-per-day', type: 'number', min: 0, max: 99999, inputmode: 'numeric', value: String(deck.reviewsPerDay ?? DECK_DEFAULTS.reviewsPerDay) });
  modal({
    title: 'Réglages du paquet',
    body: h(
      'div.form',
      h('label.field', h('span.label', 'Nom'), name),
      h('label.field', h('span.label', 'Description'), desc),
      h(
        'div.field-row',
        h('label.field', h('span.label', 'Nouvelles cartes par jour'), perDay),
        h('label.field', h('span.label', 'Révisions max. par jour'), reviews),
      ),
      h('p.small.muted', 'Avant un contrôle, augmente le nombre de nouvelles cartes par jour pour tout voir à temps.'),
    ),
    actions: [
      { label: 'Annuler', value: false },
      {
        label: 'Enregistrer',
        kind: 'primary',
        onClick: async () => {
          if (!name.value.trim()) {
            toast('Le nom ne peut pas être vide.');
            return false;
          }
          await db.putDeck({
            ...deck,
            name: name.value.trim(),
            description: desc.value.trim(),
            newPerDay: clampInt(perDay.value, 0, 9999, DECK_DEFAULTS.newPerDay),
            reviewsPerDay: clampInt(reviews.value, 0, 99999, DECK_DEFAULTS.reviewsPerDay),
          });
          toast('Réglages enregistrés.');
          navigate(`deck/${deck.id}`, { replace: true });
          return true;
        },
      },
    ],
  });
}

export function clampInt(v, min, max, fallback) {
  const n = parseInt(v, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
