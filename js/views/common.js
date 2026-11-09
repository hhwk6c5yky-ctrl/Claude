// Éléments partagés entre les écrans.
import { h, icon, lightbox, plural } from '../ui.js';
import { imageUrl } from '../images.js';
import { formatDays } from '../srs.js';
import { mathToPlain, renderRich } from '../math.js';
import { getSyncStatus, onSyncStatus } from '../sync.js';
import { goBack, navigate } from '../router.js';

/**
 * Structure d'un écran : barre du haut + contenu.
 * @param {{title:string, back?:string, actions?:Node[], body:Node|Node[], className?:string, subtitle?:string}} o
 */
export function screen({ title, back, actions = [], body, className = '', subtitle }) {
  const bar = h(
    'header.topbar',
    h(
      'div.topbar-inner',
      back !== undefined
        ? h('button.icon-btn', { type: 'button', 'aria-label': 'Retour', onclick: () => goBack(back) }, icon('back'))
        : h('span.brand-mark', { 'aria-hidden': 'true' }),
      h('div.topbar-title', h('h1', title), subtitle ? h('p.topbar-sub', subtitle) : null),
      h('div.topbar-actions', actions),
    ),
  );
  return h('div', { class: `screen ${className}` }, bar, h('main.content', { id: 'main' }, body));
}

// ---------- État de la synchronisation ----------

export function syncLabel(st = getSyncStatus()) {
  switch (st.state) {
    case 'connecting':
      return { text: 'Connexion…', tone: 'busy' };
    case 'syncing':
      return { text: st.total ? `Synchronisation… ${st.done}/${st.total}` : st.label || 'Synchronisation…', tone: 'busy' };
    case 'synced':
      return { text: 'Synchronisé', tone: 'ok' };
    case 'offline':
      return { text: 'Hors ligne : la synchro reprendra', tone: 'warn' };
    case 'error':
      return { text: st.message || 'Erreur de synchronisation', tone: 'bad' };
    default:
      return null;
  }
}

function paintSyncBadges() {
  const label = syncLabel();
  for (const el of document.querySelectorAll('.sync-badge')) {
    el.hidden = !label;
    if (!label) continue;
    el.dataset.tone = label.tone;
    el.title = label.text;
    el.setAttribute('aria-label', `Synchronisation : ${label.text}`);
  }
  for (const el of document.querySelectorAll('.sync-text')) el.textContent = label ? label.text : '';
}
onSyncStatus(paintSyncBadges);

/** Petit nuage dans la barre du haut : vert = synchronisé, orange = en cours. */
export function syncBadge() {
  const el = h('button.icon-btn.sync-badge', { type: 'button', hidden: true, onclick: () => navigate('settings') }, icon('cloud'), h('span.sync-dot'));
  setTimeout(paintSyncBadges, 0);
  return el;
}

/** Pastilles « nouvelles / en cours / à réviser », comme dans Anki. */
export function dueChips(due, { compact = false } = {}) {
  return h(
    'div.chips',
    { 'aria-label': `${due.fresh} nouvelles, ${due.learn} en cours, ${due.review} à réviser` },
    h('span.chip.new', { title: 'Nouvelles' }, String(due.fresh), compact ? null : h('small', ' nouv.')),
    h('span.chip.learn', { title: 'En cours d’apprentissage' }, String(due.learn), compact ? null : h('small', ' en cours')),
    h('span.chip.review', { title: 'À réviser' }, String(due.review), compact ? null : h('small', ' à revoir')),
  );
}

/** Face d'une carte : texte et/ou image. */
export function cardFace(side, { size = 'normal', zoom = true } = {}) {
  const text = side?.text?.trim() || '';
  const el = h('div', { class: `face face-${size}` });
  if (side?.imageId) {
    const img = h('img.face-img', { alt: text ? '' : 'Image de la carte', loading: 'lazy', decoding: 'async' });
    const frame = h('div.face-img-wrap', img);
    imageUrl(side.imageId).then((url) => {
      if (url) img.src = url;
      else frame.replaceChildren(h('p.muted', 'Image introuvable'));
    });
    if (zoom) {
      frame.classList.add('zoomable');
      frame.addEventListener('click', (e) => {
        e.stopPropagation();
        if (img.src) lightbox(img.src, text);
      });
    }
    el.append(frame);
  }
  if (text) {
    const len = mathToPlain(text).length;
    const cls = len <= 24 && !text.includes('\n') ? 'face-text big' : len > 220 ? 'face-text small' : 'face-text';
    const p = h('p', { class: cls });
    renderRich(p, text);
    el.append(p);
  }
  if (!text && !side?.imageId) el.append(h('p.face-text.muted', '(vide)'));
  return el;
}

/** Résumé court d'une face pour les listes. */
export function sideSnippet(side) {
  const t = mathToPlain(side?.text?.trim() || '');
  if (t) return t.length > 90 ? t.slice(0, 88) + '…' : t;
  return side?.imageId ? 'Image' : '—';
}

export function stateLabel(srs, now = Date.now()) {
  if (srs.state === 'new') return { text: 'Nouvelle', cls: 'new' };
  if (srs.state !== 'review') return { text: 'En cours', cls: 'learn' };
  if (srs.due <= now) return { text: 'À revoir', cls: 'review' };
  const days = Math.max(1, Math.round((srs.due - now) / 86400000));
  return { text: `Dans ${formatDays(days)}`, cls: srs.interval >= 21 ? 'mature' : 'young' };
}

export function emptyState({ title, text, actions = [] }) {
  return h('div.empty', h('div.empty-card', { 'aria-hidden': 'true' }, h('span'), h('span'), h('span')), h('h2', title), text ? h('p', text) : null, h('div.empty-actions', actions));
}

export function countLabel(n) {
  return plural(n, 'carte');
}
