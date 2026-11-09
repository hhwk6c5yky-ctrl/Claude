// Synchronisation via un dépôt GitHub privé (version GitHub Pages / Netlify).
//
// Organisation du dépôt :
//   mnemo/decks/<idPaquet>.json   le paquet, ses cartes et ses suppressions
//   mnemo/images/<idImage>.<ext>  les photos
//
// Chaque appareil lit les fichiers modifiés (repérés par leur « sha »), fusionne
// avec sa copie locale (la modification la plus récente gagne, voir
// sync-plan.js), puis réécrit les fichiers de paquets concernés. GitHub refuse
// une écriture si le fichier a changé entre-temps : on relit et on recommence.
import * as db from './db.js';
import { planSync } from './sync-plan.js';
import { base64ToBuffer, bufferToBase64 } from './images.js';

const API = 'https://api.github.com';
const DIR = 'mnemo';
const POLL_INTERVAL = 30_000;
const CHANGE_DELAY = 5_000;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg' };
const TYPE = Object.fromEntries(Object.entries(EXT).map(([t, e]) => [e, t]));

export class GitHubError extends Error {
  constructor(status, message) {
    super(message || `Erreur GitHub ${status}`);
    this.status = status;
  }
}

/** Accepte « pseudo/depot » ou une adresse github.com complète. */
export function parseRepo(input) {
  const s = String(input || '')
    .trim()
    .replace(/^https?:\/\/(www\.)?github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '');
  return /^[\w.-]+\/[\w.-]+$/.test(s) ? s : null;
}

function encodeText(text) {
  return bufferToBase64(new TextEncoder().encode(text).buffer);
}

function decodeText(b64) {
  return new TextDecoder().decode(base64ToBuffer(String(b64).replace(/\s/g, '')));
}

function makeApi(repo, token) {
  return async function api(path, { method = 'GET', body, raw = false, etag } = {}) {
    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: raw ? 'application/vnd.github.raw' : 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    if (etag) headers['If-None-Match'] = etag;
    if (body) headers['Content-Type'] = 'application/json';
    const url = path === '' ? `${API}/repos/${repo}` : `${API}/repos/${repo}/${path}`;
    let res;
    try {
      res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch {
      throw new GitHubError(0, 'Pas de connexion');
    }
    if (res.status === 304) return { notModified: true };
    if (!res.ok) {
      let message = '';
      try {
        message = (await res.json()).message;
      } catch {
        /* corps vide */
      }
      throw new GitHubError(res.status, message);
    }
    if (raw) return res.arrayBuffer();
    return { data: res.status === 204 ? null : await res.json(), etag: res.headers.get('ETag') };
  };
}

/** Vérifie le dépôt et la clé avant d'activer la synchronisation. */
export async function checkGithubAccess(repo, token) {
  const api = makeApi(repo, token);
  try {
    const { data } = await api('');
    if (data?.permissions && data.permissions.push === false) {
      return { ok: false, message: 'Cette clé ne peut que lire le dépôt. Donne-lui l’autorisation « Contents : Read and write ».' };
    }
    return { ok: true, isPrivate: data?.private !== false };
  } catch (e) {
    if (e.status === 401) return { ok: false, message: 'GitHub refuse cette clé : elle a été mal copiée, a expiré ou a été supprimée.' };
    if (e.status === 404) return { ok: false, message: `GitHub ne trouve pas le dépôt « ${repo} » avec cette clé. Vérifie l’orthographe exacte du dépôt, et que la clé a bien accès à ce dépôt (Only select repositories).` };
    if (e.status === 0) return { ok: false, message: 'Pas de connexion internet.' };
    return { ok: false, message: `GitHub a répondu : ${e.message}` };
  }
}

/**
 * Démarre la synchronisation. Renvoie { syncNow, stop }.
 * @param {{repo:string, token:string, setStatus:(s:object)=>void}} opts
 */
export function startGithubSync({ repo, token, setStatus }) {
  const api = makeApi(repo, token);
  const files = new Map(); // nom du fichier → { sha, docs }
  let dirEtag = null;
  let dirList = [];
  let imgEtag = null;
  let imgList = [];
  let gcDone = false;
  let timer = null;
  let running = false;
  let again = false;
  let pending = false;
  let stopped = false;
  let firstDone = false;

  const schedule = (delay) => {
    if (stopped) return;
    clearTimeout(timer);
    pending = true;
    timer = setTimeout(run, delay);
  };

  async function run() {
    pending = false;
    if (running) {
      again = true;
      return;
    }
    running = true;
    try {
      for (let attempt = 0; ; attempt++) {
        try {
          await reconcile();
          break;
        } catch (e) {
          if (e.conflict && attempt < 3) continue; // fichier modifié ailleurs entre-temps : on relit
          throw e;
        }
      }
      firstDone = true;
      if (!stopped && !again && !pending) setStatus({ state: 'synced', at: Date.now() });
    } catch (e) {
      handleError(e);
    } finally {
      running = false;
      if (again) {
        again = false;
        schedule(CHANGE_DELAY);
      }
    }
  }

  function handleError(e) {
    const status = e?.status;
    if (status === 0) return setStatus({ state: 'offline' });
    if (status === 401) {
      stopped = true;
      return setStatus({ state: 'error', message: 'GitHub refuse la clé d’accès (expirée ou supprimée). Reconnecte la synchronisation dans les Réglages.' });
    }
    if (status === 404) {
      stopped = true;
      return setStatus({ state: 'error', message: 'Le dépôt de synchronisation est introuvable ou la clé n’y a plus accès.' });
    }
    if (status === 403 || status === 429) return setStatus({ state: 'error', message: 'GitHub limite temporairement les requêtes. Nouvel essai automatique dans quelques minutes.' });
    setStatus({ state: 'error', message: e?.message ? `Synchronisation impossible : ${e.message}` : 'La synchronisation a échoué. Nouvel essai automatique.' });
  }

  async function listDir(path, etag, previous) {
    try {
      const r = await api(`contents/${path}`, { etag });
      if (r.notModified) return { list: previous, etag };
      return { list: Array.isArray(r.data) ? r.data : [], etag: r.etag };
    } catch (e) {
      if (e.status === 404) return { list: [], etag: null }; // dossier pas encore créé
      throw e;
    }
  }

  async function readJson(path) {
    const { data } = await api(`contents/${path}`);
    const text = data.encoding === 'base64' && data.content ? decodeText(data.content) : new TextDecoder().decode(await api(`contents/${path}`, { raw: true }));
    let parsed = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      /* fichier abîmé : traité comme vide */
    }
    return { sha: data.sha, docs: parsed.docs && typeof parsed.docs === 'object' ? parsed.docs : {} };
  }

  async function reconcile() {
    if (!firstDone) setStatus({ state: 'syncing' });

    // 1. Lire les fichiers de paquets qui ont changé.
    const dir = await listDir(`${DIR}/decks`, dirEtag, dirList);
    dirEtag = dir.etag;
    dirList = dir.list;
    const present = new Set();
    for (const f of dirList) {
      if (f.type !== 'file' || !f.name.endsWith('.json')) continue;
      present.add(f.name);
      if (files.get(f.name)?.sha !== f.sha) files.set(f.name, await readJson(f.path));
    }
    for (const name of [...files.keys()]) if (!present.has(name)) files.delete(name);

    const remote = new Map();
    const owner = new Map();
    for (const [name, file] of files) {
      for (const [docId, body] of Object.entries(file.docs)) {
        remote.set(docId, body);
        owner.set(docId, name);
      }
    }

    // 2. Fusionner avec la copie locale.
    const [decks, cards, tombstones] = await Promise.all([db.getDecks(), db.getAllCards(), db.getTombstones()]);
    const plan = planSync({ decks, cards, tombstones, remote });
    const changedLocally = plan.pullDecks.length || plan.pullCards.length || plan.deleteDeckIds.length || plan.deleteCardIds.length;
    if (plan.pullDecks.length || plan.pullCards.length) await db.bulkImport({ decks: plan.pullDecks, cards: plan.pullCards }, { silent: true });
    await db.applyRemoteDeletes({ deckIds: plan.deleteDeckIds, cardIds: plan.deleteCardIds });
    if (plan.clearTombstones.length) await db.clearTombstones(plan.clearTombstones);

    // 3. Réécrire les fichiers de paquets qui ont des changements locaux.
    const byFile = new Map();
    for (const [docId, body] of plan.push) {
      let name;
      if (body.kind === 'deck') name = `${docId.slice(2)}.json`;
      else if (body.data?.deckId) name = `${body.data.deckId}.json`;
      else name = owner.get(docId);
      if (!name) continue;
      if (!byFile.has(name)) byFile.set(name, {});
      byFile.get(name)[docId] = body;
    }
    let i = 0;
    for (const [name, docs] of byFile) {
      if (byFile.size > 2) setStatus({ state: 'syncing', done: i++, total: byFile.size });
      else setStatus({ state: 'syncing' });
      const current = files.get(name);
      const merged = { ...(current?.docs || {}), ...docs };
      const content = encodeText(JSON.stringify({ format: 'mnemo-sync', version: 1, docs: merged }));
      try {
        const { data } = await api(`contents/${DIR}/decks/${name}`, {
          method: 'PUT',
          body: { message: 'Mnémo : synchronisation', content, ...(current ? { sha: current.sha } : {}) },
        });
        files.set(name, { sha: data.content.sha, docs: merged });
        dirEtag = null;
      } catch (e) {
        if (e.status === 409 || e.status === 422) {
          files.delete(name);
          dirEtag = null;
          const err = new Error('conflit');
          err.conflict = true;
          throw err;
        }
        throw e;
      }
    }
    if (plan.pushedTombstones.length) await db.clearTombstones(plan.pushedTombstones);

    // 4. Images : envoyer les nouvelles, récupérer celles qui manquent.
    const imgs = await listDir(`${DIR}/images`, imgEtag, imgList);
    imgEtag = imgs.etag;
    imgList = imgs.list;
    const onServer = new Map();
    for (const f of imgList) {
      const m = /^(.+)\.([a-z0-9]+)$/.exec(f.name);
      if (f.type === 'file' && m) onServer.set(m[1], { ...f, type: TYPE[m[2]] || 'image/jpeg' });
    }
    const localKeys = new Set(await db.getImageKeys());
    const allCards = changedLocally ? await db.getAllCards() : cards;
    const wanted = new Set(allCards.flatMap(db.imageIds));
    let imagesChanged = false;
    for (const id of wanted) {
      const server = onServer.get(id);
      if (localKeys.has(id) && !server) {
        const img = await db.getImage(id);
        if (!img) continue;
        setStatus({ state: 'syncing', label: 'Envoi des images…' });
        const name = `${id}.${EXT[img.type] || 'jpg'}`;
        try {
          const { data } = await api(`contents/${DIR}/images/${name}`, { method: 'PUT', body: { message: 'Mnémo : image', content: bufferToBase64(img.data) } });
          onServer.set(id, { name, sha: data.content.sha, type: img.type });
        } catch (e) {
          if (e.status !== 409 && e.status !== 422) throw e; // déjà envoyée par un autre appareil
        }
        imgEtag = null;
      } else if (!localKeys.has(id) && server) {
        setStatus({ state: 'syncing', label: 'Réception des images…' });
        try {
          const buf = await api(`contents/${DIR}/images/${server.name}`, { raw: true });
          await db.putImage({ id, data: buf, type: server.type, width: 0, height: 0 });
          imagesChanged = true;
        } catch (e) {
          if (e.status === 0) throw e;
        }
      }
    }

    // 5. Ménage, une fois par session : photos que plus aucune carte n'utilise.
    if (!gcDone) {
      gcDone = true;
      const referenced = new Set(wanted);
      for (const file of files.values()) {
        for (const body of Object.values(file.docs)) if (!body.deleted && body.data) for (const id of db.imageIds(body.data)) referenced.add(id);
      }
      for (const [id, f] of onServer) {
        if (referenced.has(id)) continue;
        try {
          await api(`contents/${DIR}/images/${f.name}`, { method: 'DELETE', body: { message: 'Mnémo : image supprimée', sha: f.sha } });
          imgEtag = null;
        } catch {
          /* sans gravité */
        }
      }
    }

    if (changedLocally || imagesChanged) window.dispatchEvent(new CustomEvent('mnemo:remote-change'));
  }

  const unsubscribe = db.onLocalChange(() => {
    if (stopped) return;
    setStatus({ state: 'syncing' });
    schedule(CHANGE_DELAY);
  });
  const onVisibility = () => {
    if (document.visibilityState === 'visible') schedule(0);
    else if (pending) schedule(0); // l'appli passe en arrière-plan : on envoie tout de suite
  };
  document.addEventListener('visibilitychange', onVisibility);
  const poll = setInterval(() => {
    if (document.visibilityState === 'visible' && !running) schedule(0);
  }, POLL_INTERVAL);

  setStatus({ state: 'connecting' });
  schedule(0);

  return {
    syncNow: () => {
      stopped = false;
      schedule(0);
    },
    stop: () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(poll);
      unsubscribe();
      document.removeEventListener('visibilitychange', onVisibility);
    },
  };
}
