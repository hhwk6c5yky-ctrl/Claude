// Calcul de ce qu'il faut échanger entre la copie locale et la copie distante
// (fonction pure, testée sans navigateur). La modification la plus récente gagne.

const KINDS = [
  { kind: 'deck', prefix: 'd_' },
  { kind: 'card', prefix: 'c_' },
];

/**
 * @param {{decks: object[], cards: object[], tombstones: Record<string, number>, remote: Map<string, object>}} input
 *   remote : documents distants { kind, data, updatedAt, deleted? } indexés par identifiant (d_…, c_…, i_…)
 */
export function planSync({ decks, cards, tombstones = {}, remote }) {
  const out = {
    push: [], // [docId, body]
    pullDecks: [],
    pullCards: [],
    deleteDeckIds: [],
    deleteCardIds: [],
    pushedTombstones: [], // à effacer localement une fois envoyées
    clearTombstones: [], // déjà connues à distance
  };
  const local = { deck: new Map(decks.map((d) => [d.id, d])), card: new Map(cards.map((c) => [c.id, c])) };

  for (const { kind, prefix } of KINDS) {
    const map = local[kind];
    const pull = kind === 'deck' ? out.pullDecks : out.pullCards;
    const del = kind === 'deck' ? out.deleteDeckIds : out.deleteCardIds;

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
    const prefix = kind === 'deck' ? 'd_' : 'c_';
    if (!remote.has(prefix + id) && !local[kind]?.has(id)) out.clearTombstones.push(key);
  }
  return out;
}
