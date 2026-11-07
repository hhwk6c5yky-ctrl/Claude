import * as db from '../db.js';
import { addTextCards, createDeck } from '../store.js';
import { detectSeparators, parseCards, unescapeSeparator } from '../importer.js';
import { h, pickFile, plural, toast } from '../ui.js';
import { navigate } from '../router.js';
import { screen } from './common.js';

const TERM_CHOICES = [
  { id: 'tab', label: 'Tabulation', value: '\t' },
  { id: 'comma', label: 'Virgule', value: ',' },
  { id: 'custom', label: 'Personnalisé', value: null },
];
const ROW_CHOICES = [
  { id: 'newline', label: 'Nouvelle ligne', value: '\n' },
  { id: 'semicolon', label: 'Point-virgule', value: ';' },
  { id: 'custom', label: 'Personnalisé', value: null },
];

export async function importView({ deckId } = {}) {
  const decks = (await db.getDecks()).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const target = deckId ? decks.find((d) => d.id === deckId) : null;

  const state = { term: 'tab', termCustom: ' - ', row: 'newline', rowCustom: '\\n\\n', swap: false };

  const text = h('textarea.input.mono.import-text', {
    id: 'import-text',
    rows: 9,
    placeholder: 'Colle ici le texte exporté depuis Quizlet.\n\nExemple :\nthe weather\tla météo\nto borrow\temprunter',
    spellcheck: false,
    'aria-label': 'Texte à importer',
  });

  const termCustom = h('input.input.small-input', { id: 'term-custom', type: 'text', value: state.termCustom, 'aria-label': 'Séparateur personnalisé entre terme et définition', oninput: (e) => { state.termCustom = e.target.value; update(); } });
  const rowCustom = h('input.input.small-input', { id: 'row-custom', type: 'text', value: state.rowCustom, 'aria-label': 'Séparateur personnalisé entre les cartes', oninput: (e) => { state.rowCustom = e.target.value; update(); } });

  const segmented = (name, key, choices, custom) => {
    const group = h('div.segmented', { role: 'radiogroup', 'aria-label': name });
    const paint = () => {
      for (const b of group.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.id === state[key]));
      custom.hidden = state[key] !== 'custom';
    };
    for (const c of choices) {
      group.append(h('button', { type: 'button', role: 'radio', dataset: { id: c.id }, onclick: () => { state[key] = c.id; paint(); update(); } }, c.label));
    }
    paint();
    return { el: h('div.field', h('span.label', name), h('div.segmented-row', group, custom)), paint };
  };
  const termCtl = segmented('Entre le terme et la définition', 'term', TERM_CHOICES, termCustom);
  const rowCtl = segmented('Entre les cartes', 'row', ROW_CHOICES, rowCustom);

  const swap = h('label.check', h('input', { id: 'import-swap', type: 'checkbox', onchange: (e) => { state.swap = e.target.checked; update(); } }), 'Inverser : la définition devient la question');

  const preview = h('div.import-preview', { 'aria-live': 'polite' });

  // Destination
  const destSelect = h(
    'select.input',
    { id: 'import-dest', 'aria-label': 'Paquet de destination', onchange: () => { newName.hidden = destSelect.value !== '__new'; } },
    h('option', { value: '__new' }, 'Nouveau paquet…'),
    decks.map((d) => h('option', { value: d.id, selected: d.id === target?.id }, d.name)),
  );
  const newName = h('input.input', { id: 'import-name', type: 'text', placeholder: 'Nom du nouveau paquet', maxlength: 120, autocomplete: 'off' });
  newName.hidden = Boolean(target);

  const importBtn = h('button.btn.primary.big.wide', { type: 'button', disabled: true, onclick: () => doImport() }, 'Importer');

  let parsed = { cards: [], skipped: [] };

  const separators = () => ({
    term: state.term === 'custom' ? unescapeSeparator(state.termCustom) : TERM_CHOICES.find((c) => c.id === state.term).value,
    row: state.row === 'custom' ? unescapeSeparator(state.rowCustom) : ROW_CHOICES.find((c) => c.id === state.row).value,
  });

  const update = () => {
    const raw = text.value;
    if (!raw.trim()) {
      parsed = { cards: [], skipped: [] };
      preview.replaceChildren();
      importBtn.disabled = true;
      importBtn.textContent = 'Importer';
      return;
    }
    try {
      parsed = parseCards(raw, { ...separators(), swap: state.swap });
    } catch (err) {
      parsed = { cards: [], skipped: [] };
      preview.replaceChildren(h('p.warn', err.message));
      importBtn.disabled = true;
      return;
    }
    const n = parsed.cards.length;
    importBtn.disabled = !n;
    importBtn.textContent = n ? `Importer ${plural(n, 'carte')}` : 'Importer';
    const rows = parsed.cards.slice(0, 30).map((c, i) => h('tr', h('td.num', String(i + 1)), h('td', c.front), h('td', c.back)));
    preview.replaceChildren(
      ...[
      h('p.preview-count', n ? `${plural(n, 'carte')} reconnue${n > 1 ? 's' : ''}` : 'Aucune carte reconnue. Vérifie les séparateurs ci-dessus.'),
      n
        ? h(
            'div.table-wrap',
            h('table.preview-table', h('thead', h('tr', h('th', { scope: 'col' }, '#'), h('th', { scope: 'col' }, 'Recto'), h('th', { scope: 'col' }, 'Verso'))), h('tbody', rows)),
          )
        : null,
      n > 30 ? h('p.small.muted', `… et ${n - 30} autres.`) : null,
      parsed.skipped.length
        ? h('details.warn-box', h('summary', `${plural(parsed.skipped.length, 'ligne ignorée', 'lignes ignorées')} (sans séparateur ou avec un côté vide)`), h('ul', parsed.skipped.slice(0, 20).map((s) => h('li', s.slice(0, 140)))))
        : null,
      ].filter(Boolean),
    );
  };

  const autodetect = () => {
    const { term, row } = detectSeparators(text.value);
    const t = TERM_CHOICES.find((c) => c.value === term);
    if (t) state.term = t.id;
    else {
      state.term = 'custom';
      state.termCustom = term;
      termCustom.value = term;
    }
    const r = ROW_CHOICES.find((c) => c.value === row);
    state.row = r ? r.id : 'newline';
    termCtl.paint();
    rowCtl.paint();
  };

  text.addEventListener('paste', () => setTimeout(() => { autodetect(); update(); }, 0));
  text.addEventListener('input', update);

  const loadFile = async () => {
    const file = await pickFile({ accept: '.txt,.csv,.tsv,text/plain,text/csv,text/tab-separated-values' });
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      toast('Fichier trop volumineux (20 Mo maximum).');
      return;
    }
    text.value = await file.text();
    if (!newName.value && destSelect.value === '__new') newName.value = file.name.replace(/\.(txt|csv|tsv)$/i, '');
    autodetect();
    if (/\.csv$/i.test(file.name) && !text.value.includes('\t')) {
      state.term = text.value.includes(';') && !text.value.includes(',') ? 'custom' : 'comma';
      if (state.term === 'custom') {
        state.termCustom = ';';
        termCustom.value = ';';
      }
      termCtl.paint();
    }
    update();
  };

  const doImport = async () => {
    if (!parsed.cards.length) return;
    let deck;
    if (destSelect.value === '__new') {
      const name = newName.value.trim();
      if (!name) {
        toast('Donne un nom au nouveau paquet.');
        newName.focus();
        return;
      }
      deck = await createDeck(name);
    } else {
      deck = decks.find((d) => d.id === destSelect.value);
    }
    importBtn.disabled = true;
    try {
      await addTextCards(deck.id, parsed.cards);
      await db.putDeck(deck);
      toast(`${plural(parsed.cards.length, 'carte')} importée${parsed.cards.length > 1 ? 's' : ''} dans « ${deck.name} ».`);
      navigate(`deck/${deck.id}`, { replace: true });
    } catch (err) {
      toast(err?.message || 'L’import a échoué.');
      importBtn.disabled = false;
    }
  };

  const guide = h(
    'details.guide',
    { open: !decks.length },
    h('summary', 'Comment exporter un set depuis Quizlet'),
    h(
      'ol.steps',
      h('li', 'Ouvre ', h('strong', 'quizlet.com'), ' dans un navigateur (l’export n’existe pas dans l’appli mobile Quizlet ; sur téléphone, demande la « version pour ordinateur »).'),
      h('li', 'Ouvre ton set, appuie sur le bouton ', h('strong', '⋯'), ' puis sur ', h('strong', 'Exporter'), '.'),
      h('li', 'Laisse les réglages par défaut : ', h('strong', 'Tabulation'), ' entre terme et définition, ', h('strong', 'Nouvelle ligne'), ' entre les cartes.'),
      h('li', 'Appuie sur ', h('strong', 'Copier le texte'), ', puis colle-le ci-dessous.'),
    ),
    h('p.small.muted', 'Si tes définitions tiennent sur plusieurs lignes, choisis dans Quizlet un séparateur personnalisé entre les cartes (par exemple ', h('code', '###'), ') et indique le même ici.'),
    h('p.small.muted', 'Quizlet n’exporte pas les images. Après l’import, ouvre une carte pour lui ajouter sa photo. Les fichiers texte d’Anki (« Notes en texte brut ») et les CSV fonctionnent aussi.'),
  );

  const el = screen({
    title: 'Importer',
    subtitle: target ? `dans « ${target.name} »` : 'Quizlet, Anki, CSV',
    back: target ? `deck/${target.id}` : '',
    body: h(
      'div.import',
      guide,
      h('section.import-step', h('div.section-head', h('h2', 'Texte des cartes'), h('button.btn.small', { type: 'button', onclick: loadFile }, 'Ouvrir un fichier')), text),
      h('section.import-step', h('h2', 'Séparateurs'), termCtl.el, rowCtl.el, swap),
      h('section.import-step', h('h2', 'Aperçu'), preview),
      h('section.import-step', h('h2', 'Destination'), h('div.form', destSelect, newName), importBtn),
    ),
    className: 'import-screen',
  });

  return { el };
}
