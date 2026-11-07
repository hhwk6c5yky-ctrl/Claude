// Stockage local dans IndexedDB. Rien ne quitte l'appareil.
//
// Magasins :
//   decks  { id, name, description, newPerDay, reviewsPerDay, createdAt, updatedAt }
//   cards  { id, deckId, front:{text,imageId}, back:{text,imageId}, position, createdAt, updatedAt, srs }
//   images { id, data:ArrayBuffer, type, width, height }
//   logs   { id, cardId, deckId, rating, ts, prevState, interval }
//   meta   { key, value }

const DB_NAME = 'mnemo';
const DB_VERSION = 1;
let dbPromise = null;

export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('Ce navigateur ne permet pas le stockage local (IndexedDB indisponible).'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('decks')) db.createObjectStore('decks', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('cards')) {
        const cards = db.createObjectStore('cards', { keyPath: 'id' });
        cards.createIndex('deckId', 'deckId');
      }
      if (!db.objectStoreNames.contains('images')) db.createObjectStore('images', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('logs')) {
        const logs = db.createObjectStore('logs', { keyPath: 'id' });
        logs.createIndex('ts', 'ts');
        logs.createIndex('deckId', 'deckId');
        logs.createIndex('cardId', 'cardId');
      }
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'key' });
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('La base de données est bloquée par un autre onglet. Ferme les autres onglets de Mnémo.'));
  });
  dbPromise.catch(() => {
    dbPromise = null;
  });
  return dbPromise;
}

function promisify(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Exécute `fn(stores)` dans une transaction et attend sa fin. */
async function tx(storeNames, mode, fn) {
  const db = await open();
  const names = Array.isArray(storeNames) ? storeNames : [storeNames];
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, mode);
    const stores = Object.fromEntries(names.map((n) => [n, t.objectStore(n)]));
    let result;
    Promise.resolve(fn(stores))
      .then((r) => {
        result = r;
      })
      .catch((e) => {
        try {
          t.abort();
        } catch {
          /* déjà terminée */
        }
        reject(e);
      });
    t.oncomplete = () => resolve(result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error('Transaction annulée'));
  });
}

// ---------- Paquets ----------

export const getDecks = () => tx('decks', 'readonly', (s) => promisify(s.decks.getAll()));
export const getDeck = (id) => tx('decks', 'readonly', (s) => promisify(s.decks.get(id)));
export const putDeck = (deck) => tx('decks', 'readwrite', (s) => promisify(s.decks.put({ ...deck, updatedAt: Date.now() })));

export async function deleteDeck(id) {
  const cards = await getCards(id);
  await tx(['decks', 'cards', 'images', 'logs'], 'readwrite', async (s) => {
    s.decks.delete(id);
    for (const c of cards) {
      s.cards.delete(c.id);
      for (const imgId of imageIds(c)) s.images.delete(imgId);
    }
    const logKeys = await promisify(s.logs.index('deckId').getAllKeys(id));
    for (const k of logKeys) s.logs.delete(k);
  });
}

// ---------- Cartes ----------

export const getCards = (deckId) => tx('cards', 'readonly', (s) => promisify(s.cards.index('deckId').getAll(deckId)));
export const getAllCards = () => tx('cards', 'readonly', (s) => promisify(s.cards.getAll()));
export const getCard = (id) => tx('cards', 'readonly', (s) => promisify(s.cards.get(id)));

export const putCard = (card) => tx('cards', 'readwrite', (s) => promisify(s.cards.put(card)));

export const putCards = (cards) =>
  tx('cards', 'readwrite', (s) => {
    for (const c of cards) s.cards.put(c);
  });

export async function deleteCard(id) {
  await tx(['cards', 'images', 'logs'], 'readwrite', async (s) => {
    const card = await promisify(s.cards.get(id));
    if (!card) return;
    s.cards.delete(id);
    for (const imgId of imageIds(card)) s.images.delete(imgId);
    const logKeys = await promisify(s.logs.index('cardId').getAllKeys(id));
    for (const k of logKeys) s.logs.delete(k);
  });
}

export function imageIds(card) {
  return [card.front?.imageId, card.back?.imageId].filter(Boolean);
}

// ---------- Images ----------

export const putImage = (img) => tx('images', 'readwrite', (s) => promisify(s.images.put(img)));
export const getImage = (id) => tx('images', 'readonly', (s) => promisify(s.images.get(id)));
export const deleteImage = (id) => tx('images', 'readwrite', (s) => promisify(s.images.delete(id)));

// ---------- Historique ----------

export const addLog = (log) => tx('logs', 'readwrite', (s) => promisify(s.logs.put({ id: uid(), ...log })));
export const deleteLog = (id) => tx('logs', 'readwrite', (s) => promisify(s.logs.delete(id)));
export const getLogsSince = (ts) => tx('logs', 'readonly', (s) => promisify(s.logs.index('ts').getAll(IDBKeyRange.lowerBound(ts))));
export const getAllLogs = () => tx('logs', 'readonly', (s) => promisify(s.logs.getAll()));

// ---------- Réglages ----------

export async function getMeta(key, fallback = undefined) {
  const row = await tx('meta', 'readonly', (s) => promisify(s.meta.get(key)));
  return row ? row.value : fallback;
}
export const setMeta = (key, value) => tx('meta', 'readwrite', (s) => promisify(s.meta.put({ key, value })));

// ---------- Sauvegarde / restauration en bloc ----------

export async function bulkImport({ decks = [], cards = [], images = [], logs = [] }) {
  await tx(['decks', 'cards', 'images', 'logs'], 'readwrite', (s) => {
    for (const d of decks) s.decks.put(d);
    for (const c of cards) s.cards.put(c);
    for (const i of images) s.images.put(i);
    for (const l of logs) s.logs.put(l);
  });
}

export async function getImages(ids) {
  return tx('images', 'readonly', (s) => Promise.all(ids.map((id) => promisify(s.images.get(id)))));
}

/** Demande au navigateur de ne pas effacer les données (utile sur Safari / iOS). */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch {
    /* non pris en charge */
  }
  return false;
}

export async function storageEstimate() {
  try {
    return (await navigator.storage?.estimate?.()) || null;
  } catch {
    return null;
  }
}
