// Synchronisation entre appareils via le stockage de claude.ai.
//
// Fonctionne quand Mnémo est ouvert depuis claude.ai (connecté avec le même
// compte sur chaque appareil). Ailleurs (GitHub Pages, Netlify…), l'appli reste
// 100 % locale et ce module ne fait rien.
//
// Principe : IndexedDB reste la copie locale (rapide, hors connexion). Chaque
// paquet, carte et image a son document distant dans l'espace privé de la
// personne (data/users/<id>). À chaque changement, des deux côtés, on compare
// les dates de modification : la plus récente gagne. Les suppressions sont
// propagées grâce à des « pierres tombales » (deleted: true).
import * as db from './db.js';
import { planSync } from './sync-plan.js';

const RECONCILE_DELAY = 1200;
const LOAD_TIMEOUT = 15000;
const IMAGE_GC_AGE = 7 * 24 * 60 * 60 * 1000;

let status = { state: 'idle' };
const statusListeners = new Set();
let col = null;
let assets = null;
let remote = new Map();
let ready = false;
let timer = null;
let running = false;
let again = false;
let stopped = false;
let pending = false; // une synchronisation est programmée

export function getSyncStatus() {
  return status;
}

export function onSyncStatus(fn) {
  statusListeners.add(fn);
  return () => statusListeners.delete(fn);
}

function setStatus(next) {
  status = next;
  for (const fn of statusListeners) {
    try {
      fn(status);
    } catch {
      /* ignore */
    }
  }
}

/** Lance la synchronisation si la page tourne dans claude.ai. */
export async function initSync() {
  const claude = globalThis.claude;
  if (!claude?.use) {
    setStatus({ state: 'unsupported' });
    return;
  }
  setStatus({ state: 'connecting' });
  const [store, user, assetStore] = await Promise.all(
    ['db', 'user', 'assets'].map((name) => claude.use(name).catch(() => null)),
  );
  const uid = store && user ? await user.id().catch(() => null) : null;
  if (!store || !uid) {
    setStatus({ state: 'unavailable' });
    return;
  }
  assets = assetStore;
  col = store.collection(`data/users/${uid}`);

  const loadTimer = setTimeout(() => {
    if (!ready) setStatus({ state: 'offline' });
  }, LOAD_TIMEOUT);

  col.onSnapshot(
    (snap) => {
      remote = new Map(snap.docs.map((d) => [d.id, d.data()]));
      if (!snap.metadata.fromCache && !ready) {
        ready = true;
        clearTimeout(loadTimer);
      }
      if (ready) schedule(0);
    },
    (err) => {
      clearTimeout(loadTimer);
      stopped = true;
      setStatus({ state: 'error', message: errorMessage(err) });
    },
  );

  db.onLocalChange(() => {
    if (ready && !stopped) setStatus({ state: 'syncing' });
    schedule(RECONCILE_DELAY);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') schedule(0);
  });
}

function schedule(delay) {
  if (stopped || !ready) return;
  clearTimeout(timer);
  pending = true;
  timer = setTimeout(run, delay);
}

async function run() {
  pending = false;
  if (running) {
    again = true;
    return;
  }
  running = true;
  try {
    await reconcile();
    // « Synchronisé » seulement si aucun autre changement n'attend son tour.
    if (!stopped && !again && !pending) setStatus({ state: 'synced', at: Date.now() });
  } catch (err) {
    setStatus({ state: 'error', message: errorMessage(err) });
    if (err?.code !== 'quota_exceeded') again = true; // nouvel essai un peu plus tard
  } finally {
    running = false;
    if (again) {
      again = false;
      schedule(RECONCILE_DELAY);
    }
  }
}

async function reconcile() {
  const [decks, cards, tombstones, imageKeys] = await Promise.all([db.getDecks(), db.getAllCards(), db.getTombstones(), db.getImageKeys()]);
  const plan = planSync({ decks, cards, tombstones, remote });

  // 1. Appliquer localement ce qui vient des autres appareils.
  const changedLocally = plan.pullDecks.length || plan.pullCards.length || plan.deleteDeckIds.length || plan.deleteCardIds.length;
  if (plan.pullDecks.length || plan.pullCards.length) {
    await db.bulkImport({ decks: plan.pullDecks, cards: plan.pullCards }, { silent: true });
  }
  await db.applyRemoteDeletes({ deckIds: plan.deleteDeckIds, cardIds: plan.deleteCardIds });
  if (plan.clearTombstones.length) await db.clearTombstones(plan.clearTombstones);

  // 2. Envoyer les changements locaux.
  const total = plan.push.length;
  for (let i = 0; i < total; i++) {
    const [docId, body] = plan.push[i];
    if (total > 5) setStatus({ state: 'syncing', done: i, total });
    else if (i === 0) setStatus({ state: 'syncing' });
    await write(docId, body);
    remote.set(docId, body);
  }
  if (plan.pushedTombstones.length) await db.clearTombstones(plan.pushedTombstones);

  // 3. Images : envoyer les nouvelles, récupérer celles qui manquent.
  const localImages = new Set(imageKeys);
  const allCards = changedLocally ? await db.getAllCards() : cards;
  const wanted = new Set(allCards.flatMap(db.imageIds));
  let imagesChanged = false;
  for (const id of wanted) {
    const pointer = remote.get(`i_${id}`);
    if (localImages.has(id) && !pointer && assets) {
      const img = await db.getImage(id);
      if (!img) continue;
      setStatus({ state: 'syncing', label: 'Envoi des images…' });
      const res = await assets.upload(new Blob([img.data], { type: img.type }), { type: img.type });
      const body = { kind: 'image', asset: res.id, type: img.type, width: img.width || 0, height: img.height || 0, createdAt: Date.now() };
      await write(`i_${id}`, body);
      remote.set(`i_${id}`, body);
    } else if (!localImages.has(id) && pointer?.asset) {
      setStatus({ state: 'syncing', label: 'Réception des images…' });
      try {
        const resp = await fetch(`/_blob/${pointer.asset}`);
        if (!resp.ok) continue;
        await db.putImage({ id, data: await resp.arrayBuffer(), type: pointer.type, width: pointer.width, height: pointer.height });
        imagesChanged = true;
      } catch {
        /* réessayé à la prochaine synchronisation */
      }
    }
  }

  // 4. Ménage : images distantes que plus aucune carte n'utilise.
  if (assets) {
    const referenced = new Set(wanted);
    for (const [docId, body] of remote) {
      if (docId.startsWith('c_') && !body.deleted) for (const id of db.imageIds(body.data || {})) referenced.add(id);
    }
    for (const [docId, body] of [...remote]) {
      if (!docId.startsWith('i_') || referenced.has(docId.slice(2))) continue;
      if (Date.now() - (body.createdAt || 0) < IMAGE_GC_AGE) continue;
      try {
        await assets.delete(body.asset);
        await col.doc(docId).delete();
        remote.delete(docId);
      } catch {
        /* sans gravité : réessayé plus tard */
      }
    }
  }

  if (changedLocally || imagesChanged) window.dispatchEvent(new CustomEvent('mnemo:remote-change'));
}

async function write(docId, body, attempt = 0) {
  try {
    await col.doc(docId).set(body);
  } catch (err) {
    const code = err?.code;
    if ((code === 'unavailable' || code === 'resource_exhausted') && attempt < 4) {
      await new Promise((r) => setTimeout(r, (attempt + 1) * 1500 + Math.random() * 500));
      return write(docId, body, attempt + 1);
    }
    throw err;
  }
}

function errorMessage(err) {
  switch (err?.code) {
    case 'quota_exceeded':
      return 'L’espace de synchronisation est plein. Supprime des paquets ou des images inutilisés.';
    case 'revoked':
    case 'not_granted':
      return 'La synchronisation n’est plus autorisée sur cette page. Recharge-la.';
    case 'invalid_argument':
      return 'Une carte n’a pas pu être synchronisée (trop volumineuse ?).';
    case 'too_large':
      return 'Une image est trop lourde pour être synchronisée.';
    default:
      return 'La synchronisation a échoué. Elle reprendra automatiquement.';
  }
}
