// Calcul de ce qu'il faut échanger entre la copie locale et la copie distante
// (fonction pure, testée sans navigateur). La modification la plus récente gagne.

const KINDS = [
  { kind: 'folder', prefix: 'f_' },
  { kind: 'deck', prefix: 'd_' },
  { kind: 'card', prefix: 'c_' },
];
const PREFIX = Object.fromEntries(KINDS.map((k) => [k.kind, k.prefix]));

/**
 * @param {{decks: object[], cards: object[], tombstones: Record<string, number>, remote: Map<string, object>}} input
 *   remote : documents distants { kind, data, updatedAt, deleted? } indexés par identifiant (d_…, c_…, i_…)
 */
export function planSync({ folders = [], decks, cards, tombstones = {}, remote }) {
  const out = {
    push: [], // [docId, body]
    pullFolders: [],
    deleteFolderIds: [],
    pullDecks: [],
    pullCards: [],
    deleteDeckIds: [],
    deleteCardIds: [],
    pushedTombstones: [], // à effacer localement une fois envoyées
    clearTombstones: [], // déjà connues à distance
  };
  const local = {
    folder: new Map(folders.map((f) => [f.id, f])),
    deck: new Map(decks.map((d) => [d.id, d])),
    card: new Map(cards.map((c) => [c.id, c])),
  };
  const pulls = { folder: out.pullFolders, deck: out.pullDecks, card: out.pullCards };
  const deletes = { folder: out.deleteFolderIds, deck: out.deleteDeckIds, card: out.deleteCardIds };

  for (const { kind, prefix } of KINDS) {
    const map = local[kind];
    const pull = pulls[kind];
    const del = deletes[kind];

    for (const [id, rec] of map) {
      const docId = prefix + id;
      const r = remote.get(docId);
      const lt = rec.updatedAt || 0;
      const rt = r?.updatedAt || 0;
      if (!r || (!r.deleted && lt > rt) || (r.deleted && lt > rt)) {
        out.push.push([docId, { kind, data: rec, updatedAt: lt }]);
      } else if (r.deleted) {
        del.push(id);
      } else if (rt > lt && r.data) {
        pull.push(r.data);
      }
    }

    for (const [docId, r] of remote) {
      if (!docId.startsWith(prefix)) continue;
      const id = docId.slice(prefix.length);
      if (map.has(id)) continue;
      const key = `${kind}:${id}`;
      const tomb = tombstones[key];
      if (r.deleted) {
        if (tomb) out.clearTombstones.push(key);
        continue;
      }
      if (tomb && tomb >= (r.updatedAt || 0)) {
        out.push.push([docId, { kind, deleted: true, updatedAt: tomb }]);
        out.pushedTombstones.push(key);
      } else if (r.data) {
        pull.push(r.data);
        if (tomb) out.clearTombstones.push(key);
      }
    }
  }

  // Pierres tombales sans document distant : rien à propager.
  for (const key of Object.keys(tombstones)) {
    const [kind, id] = key.split(':');
    const prefix = PREFIX[kind];
    if (prefix && !remote.has(prefix + id) && !local[kind]?.has(id)) out.clearTombstones.push(key);
  }
  return out;
}
