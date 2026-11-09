// Petits outils d'interface : création d'éléments, icônes, notifications, boîtes de dialogue.

/**
 * Crée un élément DOM. Le texte passe toujours par textContent (pas d'injection HTML).
 *   h('button.btn.primary', { onclick }, 'Valider')
 */
export function h(tag, props, ...children) {
  const [name, ...classes] = tag.split('.');
  const el = document.createElement(name || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  for (const [k, v] of Object.entries(props || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = [el.className, v].filter(Boolean).join(' ');
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k in el && typeof v !== 'string') el[k] = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const ICONS = {
  back: 'M15 18l-6-6 6-6',
  plus: 'M12 5v14M5 12h14',
  import: 'M12 3v12m0 0l-4-4m4 4l4-4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
  export: 'M12 15V3m0 0L8 7m4-4l4 4M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2',
  settings: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z',
  image: 'M4 5h16a1 1 0 011 1v12a1 1 0 01-1 1H4a1 1 0 01-1-1V6a1 1 0 011-1zm4 5.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3zM21 15l-5-5-11 9',
  camera: 'M4 8h3l2-3h6l2 3h3a1 1 0 011 1v10a1 1 0 01-1 1H4a1 1 0 01-1-1V9a1 1 0 011-1zm8 9a4 4 0 100-8 4 4 0 000 8z',
  trash: 'M4 7h16M10 11v6m4-6v6M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13M9 7V4h6v3',
  edit: 'M4 20h4L19 9a2.8 2.8 0 00-4-4L4 16v4zM13.5 6.5l4 4',
  undo: 'M9 14L4 9l5-5M4 9h11a5 5 0 010 10h-3',
  close: 'M6 6l12 12M18 6L6 18',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zm9 3l-4.3-4.3',
  swap: 'M7 4L3 8l4 4M3 8h14M17 20l4-4-4-4m4 4H7',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  check: 'M5 12l5 5L20 7',
  shuffle: 'M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  play: 'M7 4l13 8-13 8V4z',
  cloud: 'M7 18h10a4 4 0 00.6-7.96A6 6 0 006.2 9.1 4.5 4.5 0 007 18z',
  keyboard: 'M3 6h18a1 1 0 011 1v10a1 1 0 01-1 1H3a1 1 0 01-1-1V7a1 1 0 011-1zM6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10',
};

/** Thème : « auto » suit le réglage du système. */
export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'light' || theme === 'dark') root.dataset.theme = theme;
  else delete root.dataset.theme;
}

export function icon(name, label) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  if (label) {
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', label);
  } else svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', ICONS[name] || '');
  svg.append(path);
  return svg;
}

// ---------- Notifications ----------

let toastTimer;
export function toast(message, { action, onAction, duration = 3200 } = {}) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div.toast', { id: 'toast', role: 'status', 'aria-live': 'polite' });
    document.body.append(el);
  }
  el.replaceChildren(h('span', message));
  if (action && onAction) {
    el.append(
      h('button.toast-action', { type: 'button', onclick: () => { el.classList.remove('show'); onAction(); } }, action),
    );
  }
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ---------- Boîtes de dialogue (sans alert/confirm natifs) ----------

export function modal({ title, body, actions = [], onClose, wide = false }) {
  const previous = document.activeElement;
  const backdrop = h('div.modal-backdrop');
  const box = h('div.modal', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, class: wide ? 'wide' : '' });
  const close = (value) => {
    backdrop.remove();
    document.removeEventListener('keydown', onKey, true);
    previous?.focus?.();
    onClose?.(value);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close(null);
    }
  };
  box.append(
    h('div.modal-head', h('h2', title), h('button.icon-btn', { type: 'button', 'aria-label': 'Fermer', onclick: () => close(null) }, icon('close'))),
    h('div.modal-body', body),
  );
  if (actions.length) {
    box.append(
      h(
        'div.modal-actions',
        actions.map((a) =>
          h(`button.btn${a.kind ? '.' + a.kind : ''}`, { type: 'button', onclick: async () => {
            const keep = await a.onClick?.();
            if (keep !== false) close(a.value ?? true);
          } }, a.label),
        ),
      ),
    );
  }
  backdrop.append(box);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close(null);
  });
  document.addEventListener('keydown', onKey, true);
  document.body.append(backdrop);
  const focusable = box.querySelector('input, textarea, select, .modal-actions .btn.primary, .modal-actions .btn.danger');
  (focusable || box.querySelector('button'))?.focus();
  return { close, box };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    modal({
      title,
      body: h('p', message),
      actions: [
        { label: 'Annuler', value: false },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', value: true },
      ],
      onClose: (v) => resolve(v === true),
    });
  });
}

/** Affiche une image en plein écran. */
export function lightbox(src, alt = '') {
  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  const onKey = (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close();
    }
  };
  const el = h(
    'div.lightbox',
    { onclick: close, role: 'dialog', 'aria-label': 'Image agrandie' },
    h('img', { src, alt }),
    h('button.icon-btn.lightbox-close', { type: 'button', 'aria-label': 'Fermer' }, icon('close')),
  );
  document.addEventListener('keydown', onKey, true);
  document.body.append(el);
}

export function plural(n, one, many = one + 's') {
  return `${n} ${n > 1 ? many : one}`;
}

export function pickFile({ accept = '*/*', capture } = {}) {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept, style: { display: 'none' } });
    if (capture) input.setAttribute('capture', capture);
    input.addEventListener('change', () => {
      resolve(input.files?.[0] || null);
      input.remove();
    });
    input.addEventListener('cancel', () => {
      resolve(null);
      input.remove();
    });
    document.body.append(input);
    input.click();
  });
}
