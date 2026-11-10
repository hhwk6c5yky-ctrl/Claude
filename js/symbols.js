// Clavier de symboles : lettres grecques, symboles mathématiques, exposants, formules.
import { h } from './ui.js';
import { expandKeyword, nextBox, prevBox } from './math-edit.js';

const chars = (s) => s.split(' ').map((c) => ({ label: c, insert: c }));

export const SYMBOL_GROUPS = [
  {
    id: 'greek',
    label: 'Grec',
    items: chars('α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ ς τ υ φ χ ψ ω Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω'),
    help: 'Au clavier : Ctrl+G puis une lettre (a → α, q → θ, c → χ, y → ψ, w → ω), avec Maj pour les majuscules.',
  },
  {
    id: 'ops',
    label: 'Opérations',
    items: chars('± × ÷ · − ∓ = ≠ ≈ ≡ < > ≤ ≥ ≪ ≫ ∝ ∞ √ ∛ ∑ ∏ ∫ ∮ ∂ ∇ % ‰ ° ′ ″ ½ ⅓ ¼ ¾'),
  },
  {
    id: 'sets',
    label: 'Ensembles, logique',
    items: chars('∈ ∉ ∋ ⊂ ⊆ ⊄ ⊃ ∪ ∩ ∖ ∅ ℕ ℤ ℚ ℝ ℂ ∀ ∃ ∄ ¬ ∧ ∨ ⇒ ⇐ ⇔ → ← ↔ ↦ ⟶ ↑ ↓ ⇌'),
  },
  {
    id: 'scripts',
    label: 'Exposants, indices',
    items: chars('⁰ ¹ ² ³ ⁴ ⁵ ⁶ ⁷ ⁸ ⁹ ⁺ ⁻ ⁼ ⁽ ⁾ ⁿ ˣ ⁱ ₀ ₁ ₂ ₃ ₄ ₅ ₆ ₇ ₈ ₉ ₊ ₋ ₌ ₍ ₎ ₙ ₓ ᵢ'),
  },
  {
    id: 'geo',
    label: 'Géométrie',
    items: chars('∠ ∡ ⊥ ∥ ≅ ∼ △ □ ○ ⌀ π ° ′ ″'),
  },
  {
    id: 'tex',
    label: 'Formules',
    // `|` marque la position du curseur après l'insertion.
    items: [
      { label: '$…$', insert: '$|$', hint: 'Formule' },
      { label: 'a⁄b', insert: '\\frac{|}{}', hint: 'Fraction' },
      { label: '√', insert: '\\sqrt{|}', hint: 'Racine' },
      { label: 'xⁿ', insert: '^{|}', hint: 'Exposant' },
      { label: 'xₙ', insert: '_{|}', hint: 'Indice' },
      { label: '∫', insert: '\\int_{|}^{}', hint: 'Intégrale' },
      { label: '∑', insert: '\\sum_{|}^{}', hint: 'Somme' },
      { label: '∑ k=…', insert: '\\sum_{k=|}^{}', hint: 'Somme de k = … à …' },
      { label: '∑ série', insert: '\\sum_{n=|}^{+\\infty}', hint: 'Série : n = … à +∞' },
      { label: 'lim', insert: '\\lim_{x \\to |}', hint: 'Limite' },
      { label: 'u →', insert: '\\vec{|}', hint: 'Vecteur' },
      { label: '( )', insert: '\\left( | \\right)', hint: 'Grandes parenthèses' },
      { label: '$$…$$', insert: '$$|$$', hint: 'Formule centrée' },
    ],
    help: 'Raccourcis : tape sum, frac, sqrt, vect, int, lim, prod, ind (indice) ou exp (exposant) puis Espace. Tab passe à la case suivante, puis sort de la formule.',
  },
];

// ---------- Raccourci clavier : Ctrl+G puis une lettre ----------

/** Lettre latine → lettre grecque (Maj pour les majuscules). */
export const GREEK_KEYS = {
  a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ', h: 'η', q: 'θ', i: 'ι', k: 'κ', l: 'λ', m: 'μ',
  n: 'ν', x: 'ξ', o: 'ο', p: 'π', r: 'ρ', s: 'σ', j: 'ς', t: 'τ', u: 'υ', f: 'φ', c: 'χ', y: 'ψ', w: 'ω',
};

/** Lettre grecque pour une touche (« a » → α, « A » → Α), ou null. */
export function greekFor(key) {
  if (typeof key !== 'string' || key.length !== 1) return null;
  const lower = key.toLowerCase();
  const g = GREEK_KEYS[lower];
  if (!g) return null;
  if (key === lower) return g;
  return g === 'ς' ? 'Σ' : g.toUpperCase();
}

function isTextField(el) {
  if (!el || el.readOnly || el.disabled) return false;
  if (el.tagName === 'TEXTAREA') return true;
  return el.tagName === 'INPUT' && ['text', 'search', ''].includes(el.type) && typeof el.setRangeText === 'function';
}

/**
 * Active le raccourci dans tous les champs de texte de l'appli :
 * Ctrl+G (ou Cmd+G), puis une lettre → lettre grecque. Échap annule.
 */
export function installGreekShortcut({ notify } = {}) {
  let waitingIn = null;
  const stop = () => {
    waitingIn?.classList.remove('greek-waiting');
    waitingIn = null;
  };
  document.addEventListener(
    'keydown',
    (e) => {
      const field = e.target;
      if (waitingIn) {
        if (['Shift', 'CapsLock'].includes(e.key)) return; // on attend la lettre
        const target = waitingIn;
        stop();
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const letter = !e.ctrlKey && !e.metaKey && !e.altKey ? greekFor(e.key) : null;
        if (letter && field === target) {
          e.preventDefault();
          e.stopPropagation();
          insertAtCursor(target, letter);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'g' || e.key === 'G') && isTextField(field)) {
        e.preventDefault();
        e.stopPropagation();
        waitingIn = field;
        field.classList.add('greek-waiting');
        notify?.('Lettre grecque : tape une lettre (a → α, Maj + d → Δ). Échap pour annuler.');
      }
    },
    true,
  );
  document.addEventListener('focusout', stop, true);
}

// ---------- Saisie des formules dans l'éditeur ----------

/**
 * Dans les champs de l'éditeur de cartes :
 * - « sum », « frac », « vect »… puis Espace (ou Tab) → formule, curseur dans la 1re case ;
 * - Tab → case vide suivante, puis sortie de la formule ; Maj+Tab → case précédente.
 * @param {{enabled: () => boolean}} opts
 */
export function installMathEditing({ enabled = () => true } = {}) {
  document.addEventListener(
    'keydown',
    (e) => {
      const field = e.target;
      if (!field?.matches?.('textarea.side-text') || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      if (field.selectionStart !== field.selectionEnd) return;
      const caret = field.selectionStart;
      const isTab = e.key === 'Tab';
      if ((e.key === ' ' || (isTab && !e.shiftKey)) && enabled()) {
        const ex = expandKeyword(field.value, caret);
        if (ex) {
          e.preventDefault();
          field.setRangeText(ex.insert, ex.from, ex.to, 'end');
          field.setSelectionRange(ex.caret, ex.caret);
          field.dispatchEvent(new Event('input', { bubbles: true }));
          return;
        }
      }
      if (!isTab) return;
      const target = e.shiftKey ? prevBox(field.value, caret) : nextBox(field.value, caret);
      if (target === null) return; // hors formule : Tab garde son rôle habituel
      e.preventDefault();
      field.setSelectionRange(target, target);
    },
    true,
  );

  // Claviers de téléphone : l'Espace n'arrive souvent pas comme une touche
  // (keydown), seulement comme du texte inséré. On regarde donc aussi chaque saisie.
  document.addEventListener('input', (e) => {
    const field = e.target;
    if (!field?.matches?.('textarea.side-text') || !enabled() || e.inputType !== 'insertText' || !/\s$/.test(e.data || '')) return;
    const caret = field.selectionStart;
    if (caret !== field.selectionEnd || caret < 1) return;
    const space = field.value.slice(caret - 1, caret);
    if (!/\s/.test(space)) return;
    const withoutSpace = field.value.slice(0, caret - 1) + field.value.slice(caret);
    const ex = expandKeyword(withoutSpace, caret - 1);
    if (!ex) return;
    field.setRangeText(ex.insert, ex.from, caret, 'end');
    field.setSelectionRange(ex.caret, ex.caret);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const STORAGE_KEY = 'mnemo.symbolTab';

function readTab() {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'greek';
  } catch {
    return 'greek';
  }
}

function saveTab(id) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* stockage indisponible */
  }
}

/** Insère `text` à la position du curseur dans un champ ; `|` indique où placer le curseur. */
export function insertAtCursor(field, text) {
  const caret = text.indexOf('|');
  const clean = text.replace('|', '');
  const start = field.selectionStart ?? field.value.length;
  const end = field.selectionEnd ?? field.value.length;
  field.setRangeText(clean, start, end, 'end');
  if (caret >= 0) {
    const pos = start + caret;
    field.setSelectionRange(pos, pos);
  }
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Bouton « Symboles » + panneau à insérer sous un champ.
 * @param {() => HTMLInputElement|HTMLTextAreaElement} getField champ cible
 * @param {{ formulas?: boolean, compact?: boolean }} opts
 */
export function symbolPicker(getField, { formulas = true, compact = false } = {}) {
  const groups = SYMBOL_GROUPS.filter((g) => formulas || g.id !== 'tex');
  let tab = readTab();
  if (!groups.some((g) => g.id === tab)) tab = groups[0].id;

  const panel = h('div.symbols', { hidden: true, role: 'group', 'aria-label': 'Symboles à insérer' });
  const tabs = h('div.symbol-tabs', { role: 'tablist' });
  const grid = h('div.symbol-grid');
  const help = h('p.symbol-help.small.muted');
  panel.append(tabs, grid, help);

  // Garde le clavier du téléphone ouvert : on n'enlève pas le focus du champ.
  const keepFocus = (e) => e.preventDefault();

  const paint = () => {
    tabs.replaceChildren(
      ...groups.map((g) =>
        h('button.symbol-tab', { type: 'button', role: 'tab', 'aria-selected': String(g.id === tab), onpointerdown: keepFocus, onclick: () => { tab = g.id; saveTab(tab); paint(); } }, g.label),
      ),
    );
    const group = groups.find((g) => g.id === tab);
    grid.className = `symbol-grid${group.id === 'tex' ? ' wide' : ''}`;
    grid.replaceChildren(
      ...group.items.map((item) =>
        h(
          'button.symbol-key',
          {
            type: 'button',
            title: item.hint || shortcutHint(item.insert),
            'aria-label': item.hint ? `${item.hint} (${item.label})` : item.label,
            onpointerdown: keepFocus,
            onclick: () => {
              const field = getField();
              if (!field) return;
              let text = item.insert;
              // Une commande de formule tapée hors d'une formule : on l'entoure de $…$.
              if (group.id === 'tex' && !text.startsWith('$') && !insideMath(field)) text = `$${text}$`;
              insertAtCursor(field, text);
              field.focus({ preventScroll: true });
            },
          },
          item.label,
          item.hint ? h('small', item.hint) : null,
        ),
      ),
    );
    help.textContent = group.help || '';
    help.hidden = !group.help;
  };
  paint();

  const button = h(
    `button.btn.small${compact ? '.ghost' : ''}`,
    {
      type: 'button',
      'aria-expanded': 'false',
      title: 'Lettres grecques et symboles mathématiques',
      onpointerdown: keepFocus,
      onclick: () => {
        panel.hidden = !panel.hidden;
        button.setAttribute('aria-expanded', String(!panel.hidden));
      },
    },
    h('span.symbol-icon', { 'aria-hidden': 'true' }, 'Ωπ'),
    compact ? null : 'Symboles',
  );
  if (compact) button.setAttribute('aria-label', 'Symboles');
  return { button, panel };
}

function shortcutHint(char) {
  for (const [k, g] of Object.entries(GREEK_KEYS)) {
    if (g === char) return `${char} : Ctrl+G puis ${k}`;
    if (g.toUpperCase() === char && g !== 'ς') return `${char} : Ctrl+G puis Maj+${k}`;
  }
  return char;
}

/** Le curseur est-il déjà entre deux $ ? */
function insideMath(field) {
  const before = field.value.slice(0, field.selectionStart ?? 0).replace(/\\\$/g, '');
  return (before.match(/\$/g) || []).length % 2 === 1;
}
