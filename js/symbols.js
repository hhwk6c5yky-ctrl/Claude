// Clavier de symboles : lettres grecques, symboles mathématiques, exposants, formules.
import { h } from './ui.js';

const chars = (s) => s.split(' ').map((c) => ({ label: c, insert: c }));

export const SYMBOL_GROUPS = [
  {
    id: 'greek',
    label: 'Grec',
    items: chars('α β γ δ ε ζ η θ ι κ λ μ ν ξ ο π ρ σ ς τ υ φ χ ψ ω Α Β Γ Δ Ε Ζ Η Θ Ι Κ Λ Μ Ν Ξ Ο Π Ρ Σ Τ Υ Φ Χ Ψ Ω'),
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
      { label: 'lim', insert: '\\lim_{x \\to |}', hint: 'Limite' },
      { label: 'u →', insert: '\\vec{|}', hint: 'Vecteur' },
      { label: '( )', insert: '\\left( | \\right)', hint: 'Grandes parenthèses' },
      { label: '$$…$$', insert: '$$|$$', hint: 'Formule centrée' },
    ],
    help: 'Écris une formule entre deux $ : $x^2$, $\\frac{1}{2}$, $\\sqrt{2}$, $\\alpha + \\beta$. Elle s’affiche joliment sur la carte.',
  },
];

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
            title: item.hint || item.insert,
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

/** Le curseur est-il déjà entre deux $ ? */
function insideMath(field) {
  const before = field.value.slice(0, field.selectionStart ?? 0).replace(/\\\$/g, '');
  return (before.match(/\$/g) || []).length % 2 === 1;
}
