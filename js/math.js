// Formules mathématiques dans les cartes.
//
// Syntaxe (la même qu'Anki, Obsidian ou Notion) :
//   $x^2 + \alpha$          formule dans le texte
//   $$\int_0^1 f(x)\,dx$$   formule centrée sur sa propre ligne
//   \( … \) et \[ … \]      variantes acceptées
//   \$                      un vrai signe dollar
//
// Les symboles Unicode (α, π, ≤, √…) s'écrivent directement, sans formule.
// Le rendu utilise KaTeX, livré avec l'appli (fonctionne hors connexion) et
// chargé seulement quand une carte contient une formule.

/** Découpe un texte en morceaux de texte simple et de formules. */
export function splitMath(text) {
  const src = String(text ?? '');
  const out = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf) out.push({ type: 'text', value: buf });
    buf = '';
  };
  const push = (value, display) => {
    flush();
    out.push({ type: 'math', value: value.trim(), display });
  };

  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\' && src[i + 1] === '$') {
      buf += '$';
      i += 2;
      continue;
    }
    if (ch === '\\' && (src[i + 1] === '(' || src[i + 1] === '[')) {
      const close = src[i + 1] === '(' ? '\\)' : '\\]';
      const end = src.indexOf(close, i + 2);
      if (end > i + 2) {
        push(src.slice(i + 2, end), src[i + 1] === '[');
        i = end + 2;
        continue;
      }
    }
    if (ch === '$' && src[i + 1] === '$') {
      const end = src.indexOf('$$', i + 2);
      if (end > i + 2 && src.slice(i + 2, end).trim()) {
        push(src.slice(i + 2, end), true);
        i = end + 2;
        continue;
      }
    }
    if (ch === '$') {
      const end = findInlineEnd(src, i);
      if (end > 0) {
        push(src.slice(i + 1, end), false);
        i = end + 1;
        continue;
      }
    }
    buf += ch;
    i += 1;
  }
  flush();
  return out;
}

// $…$ : pas d'espace juste après le $ ouvrant ni juste avant le $ fermant,
// pas de chiffre juste après le $ fermant (« entre 5 $ et 10 $ » reste du texte).
function findInlineEnd(src, start) {
  const first = src[start + 1];
  if (!first || /\s|\$/.test(first)) return -1;
  for (let j = start + 1; j < src.length; j++) {
    const c = src[j];
    if (c === '\n') return -1;
    if (c === '\\') {
      j += 1;
      continue;
    }
    if (c === '$') {
      if (/\s/.test(src[j - 1]) || /\d/.test(src[j + 1] || '')) continue;
      return j;
    }
  }
  return -1;
}

export function hasMath(text) {
  return splitMath(text).some((p) => p.type === 'math');
}

// ---------- Version texte des formules (listes, vérification des réponses) ----------

const GREEK = {
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', epsilon: 'ε', varepsilon: 'ε', zeta: 'ζ', eta: 'η',
  theta: 'θ', vartheta: 'ϑ', iota: 'ι', kappa: 'κ', lambda: 'λ', mu: 'μ', nu: 'ν', xi: 'ξ', omicron: 'ο',
  pi: 'π', varpi: 'ϖ', rho: 'ρ', varrho: 'ϱ', sigma: 'σ', varsigma: 'ς', tau: 'τ', upsilon: 'υ', phi: 'φ',
  varphi: 'φ', chi: 'χ', psi: 'ψ', omega: 'ω',
  Gamma: 'Γ', Delta: 'Δ', Theta: 'Θ', Lambda: 'Λ', Xi: 'Ξ', Pi: 'Π', Sigma: 'Σ', Upsilon: 'Υ', Phi: 'Φ',
  Psi: 'Ψ', Omega: 'Ω',
};

const SYMBOLS = {
  times: '×', cdot: '·', div: '÷', pm: '±', mp: '∓', le: '≤', leq: '≤', ge: '≥', geq: '≥', neq: '≠', ne: '≠',
  approx: '≈', equiv: '≡', sim: '∼', propto: '∝', infty: '∞', partial: '∂', nabla: '∇', sum: '∑', prod: '∏',
  int: '∫', oint: '∮', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆', supset: '⊃', cup: '∪', cap: '∩',
  emptyset: '∅', varnothing: '∅', forall: '∀', exists: '∃', neg: '¬', land: '∧', lor: '∨', to: '→',
  rightarrow: '→', leftarrow: '←', leftrightarrow: '↔', Rightarrow: '⇒', Leftarrow: '⇐', Leftrightarrow: '⇔',
  implies: '⇒', iff: '⇔', mapsto: '↦', angle: '∠', perp: '⊥', parallel: '∥', circ: '∘', degree: '°',
  ldots: '…', cdots: '⋯', dots: '…', hbar: 'ℏ', ell: 'ℓ', prime: '′', star: '⋆', ast: '∗', sqrt: '√',
  lbrace: '{', rbrace: '}', langle: '⟨', rangle: '⟩', vert: '|', mid: '|',
};

const SUP = { 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', '+': '⁺', '-': '⁻', '=': '⁼', '(': '⁽', ')': '⁾', n: 'ⁿ', i: 'ⁱ', x: 'ˣ' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉', '+': '₊', '-': '₋', '=': '₌', '(': '₍', ')': '₎', n: 'ₙ', i: 'ᵢ', x: 'ₓ' };
const BB = { R: 'ℝ', N: 'ℕ', Z: 'ℤ', Q: 'ℚ', C: 'ℂ' };

function script(content, table, marker) {
  const chars = [...content];
  if (chars.every((c) => table[c])) return chars.map((c) => table[c]).join('');
  return `${marker}(${content})`;
}

/** Convertit une formule LaTeX simple en texte Unicode lisible (approximation). */
export function texToPlain(tex) {
  let s = String(tex ?? '');
  // commandes à argument
  for (let k = 0; k < 4; k++) {
    s = s
      .replace(/\\(?:text|mathrm|textbf|mathbf|operatorname|mathit)\s*\{([^{}]*)\}/g, '$1')
      .replace(/\\mathbb\s*\{([A-Z])\}/g, (_, c) => BB[c] || c)
      .replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, (_, a, b) => `${wrap(a)}/${wrap(b)}`)
      .replace(/\\sqrt\s*\{([^{}]*)\}/g, (_, a) => `√${wrap(a)}`)
      .replace(/\\vec\s*\{([^{}]*)\}/g, '$1⃗')
      .replace(/\\(?:overline|bar)\s*\{([^{}]*)\}/g, '$1̅');
  }
  s = s
    .replace(/\\(left|right|big|Big|bigg|Bigg)\b/g, '')
    .replace(/\\[,;:! ]/g, ' ')
    .replace(/\\quad|\\qquad/g, ' ')
    .replace(/\\\\/g, ' ')
    .replace(/\\([a-zA-Z]+)/g, (m, name) => GREEK[name] || SYMBOLS[name] || (/^(sin|cos|tan|ln|log|exp|lim|max|min|det)$/.test(name) ? name : m))
    .replace(/\^\{([^{}]*)\}|\^(\S)/g, (_, a, b) => script(a ?? b, SUP, '^'))
    .replace(/_\{([^{}]*)\}|_(\S)/g, (_, a, b) => script(a ?? b, SUB, '_'))
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function wrap(x) {
  return /^(?:\\[a-zA-Z]+|[\w.]+)$/u.test(x.trim()) ? x.trim() : `(${x})`;
}

/** Remplace les formules d'un texte par leur version Unicode. */
export function mathToPlain(text) {
  return splitMath(text)
    .map((p) => (p.type === 'math' ? texToPlain(p.value) : p.value))
    .join('');
}

// ---------- Rendu dans la page ----------

let katexPromise = null;

function loadKatex() {
  if (globalThis.katex) return Promise.resolve(globalThis.katex);
  if (katexPromise) return katexPromise;
  katexPromise = new Promise((resolve, reject) => {
    const base = new URL('../vendor/katex/', import.meta.url);
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = new URL('katex.min.css', base).href;
    document.head.append(css);
    const js = document.createElement('script');
    js.src = new URL('katex.min.js', base).href;
    js.onload = () => resolve(globalThis.katex);
    js.onerror = () => {
      katexPromise = null;
      reject(new Error('Impossible de charger le moteur de formules.'));
    };
    document.head.append(js);
  });
  return katexPromise;
}

/**
 * Remplit `el` avec le texte, en affichant les formules.
 * Sans formule, c'est du texte brut (aucun HTML interprété).
 */
export function renderRich(el, text) {
  const parts = splitMath(text);
  el.replaceChildren();
  if (!parts.some((p) => p.type === 'math')) {
    el.textContent = String(text ?? '');
    return;
  }
  const pending = [];
  for (const p of parts) {
    if (p.type === 'text') {
      el.append(document.createTextNode(p.value));
      continue;
    }
    const span = document.createElement('span');
    span.className = p.display ? 'math math-display' : 'math';
    span.textContent = texToPlain(p.value); // affiché en attendant KaTeX
    pending.push([span, p]);
    el.append(span);
  }
  loadKatex()
    .then((katex) => {
      for (const [span, p] of pending) {
        try {
          katex.render(p.value, span, { displayMode: p.display, throwOnError: false, strict: false, trust: false, output: 'htmlAndMathml' });
        } catch {
          span.textContent = p.value;
        }
      }
    })
    .catch(() => {
      /* la version texte reste affichée */
    });
}
