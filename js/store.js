// Logique applicative au-dessus de la base : réglages, création de cartes, statistiques.
import * as db from './db.js';
import { DEFAULT_SETTINGS, dayStart, isMature, newSrs } from './srs.js';
import { dueCounts } from './session.js';

export const DECK_DEFAULTS = { newPerDay: 20, reviewsPerDay: 200 };

export async function getSettings() {
  const saved = await db.getMeta('settings', {});
  return { ...DEFAULT_SETTINGS, ...saved };
}

export async function saveSettings(patch) {
  const current = await db.getMeta('settings', {});
  await db.setMeta('settings', { ...current, ...patch });
}

export async function getPrefs() {
  return { typeAnswer: false, theme: 'auto', ...(await db.getMeta('prefs', {})) };
}

export async function savePrefs(patch) {
  const current = await db.getMeta('prefs', {});
  await db.setMeta('prefs', { ...current, ...patch });
}

export async function createDeck(name, extra = {}) {
  const now = Date.now();
  const deck = { id: db.uid(), name: name.trim() || 'Sans titre', description: '', ...DECK_DEFAULTS, createdAt: now, updatedAt: now, ...extra };
  await db.putDeck(deck);
  return deck;
}

export function makeCard(deckId, front, back, position = Date.now()) {
  const now = Date.now();
  return {
    id: db.uid(),
    deckId,
    front: { text: front?.text ?? '', imageId: front?.imageId ?? null },
    back: { text: back?.text ?? '', imageId: back?.imageId ?? null },
    position,
    createdAt: now,
    updatedAt: now,
    srs: newSrs(),
  };
}

/** Ajoute des cartes texte en lot (import). Garde l'ordre d'origine. */
export async function addTextCards(deckId, pairs) {
  const base = Date.now();
  const cards = pairs.map((p, i) => makeCard(deckId, { text: p.front }, { text: p.back }, base + i));
  await db.putCards(cards);
  return cards;
}

/** Réponses déjà données aujourd'hui, par paquet. */
export async function todayActivity(settings) {
  const since = dayStart(Date.now(), settings.dayStartHour);
  const logs = await db.getLogsSince(since);
  const byDeck = new Map();
  for (const l of logs) {
    const d = byDeck.get(l.deckId) || { fresh: 0, review: 0, total: 0 };
    if (l.prevState === 'new') d.fresh += 1;
    else if (l.prevState === 'review') d.review += 1;
    d.total += 1;
    byDeck.set(l.deckId, d);
  }
  return { byDeck, total: logs.length };
}

export function deckSummary(deck, cards, done, settings, now = Date.now()) {
  const due = dueCounts(cards, {
    now,
    newPerDay: deck.newPerDay ?? DECK_DEFAULTS.newPerDay,
    reviewsPerDay: deck.reviewsPerDay ?? DECK_DEFAULTS.reviewsPerDay,
    doneToday: done || { fresh: 0, review: 0 },
    settings,
  });
  let fresh = 0;
  let learning = 0;
  let young = 0;
  let mature = 0;
  for (const c of cards) {
    if (c.srs.state === 'new') fresh += 1;
    else if (c.srs.state === 'review') {
      if (isMature(c.srs)) mature += 1;
      else young += 1;
    } else learning += 1;
  }
  const nextDue = cards
    .filter((c) => c.srs.state !== 'new')
    .reduce((min, c) => Math.min(min, c.srs.due), Infinity);
  return { total: cards.length, fresh, learning, young, mature, due, dueTotal: due.fresh + due.learn + due.review, nextDue };
}

/** Enregistre une réponse : met la carte à jour et garde une trace dans l'historique. */
export async function recordAnswer(before, after, rating) {
  await db.putCard({ ...after, updatedAt: Date.now() });
  const log = {
    id: db.uid(),
    cardId: before.id,
    deckId: before.deckId,
    rating,
    ts: Date.now(),
    prevState: before.srs.state,
    interval: after.srs.interval,
  };
  await db.addLog(log);
  return log.id;
}

export async function undoAnswer(before, logId) {
  await db.putCard(before);
  if (logId) await db.deleteLog(logId);
}

export async function resetProgress(deckId) {
  const cards = await db.getCards(deckId);
  await db.putCards(cards.map((c) => ({ ...c, srs: newSrs() })));
}

export const SAMPLE_DECK = {
  name: 'Exemple : capitales d’Europe',
  description: 'Un petit paquet pour découvrir l’appli. Tu peux le supprimer quand tu veux.',
  cards: [
    ['Capitale du Portugal', 'Lisbonne'],
    ['Capitale de l’Autriche', 'Vienne'],
    ['Capitale de la Hongrie', 'Budapest'],
    ['Capitale de la Pologne', 'Varsovie'],
    ['Capitale de l’Irlande', 'Dublin'],
    ['Capitale de la Finlande', 'Helsinki'],
    ['Capitale de la Roumanie', 'Bucarest'],
    ['Capitale de la Croatie', 'Zagreb'],
    ['Capitale de la Slovaquie', 'Bratislava'],
    ['Capitale de la Lituanie', 'Vilnius'],
  ],
};

export async function createSampleDeck() {
  const deck = await createDeck(SAMPLE_DECK.name, { description: SAMPLE_DECK.description });
  await addTextCards(deck.id, SAMPLE_DECK.cards.map(([front, back]) => ({ front, back })));
  return deck;
}
