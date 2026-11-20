// File d'attente d'une séance de révision (logique pure, sans DOM).
import { DEFAULT_SETTINGS, MINUTE, isLearning, schedule } from './srs.js';

export class StudySession {
  /**
   * @param {Array} cards  cartes du paquet (chaque carte a un champ `srs`)
   * @param {object} opts  { now, newLimit, reviewLimit, settings, shuffle, rng, deckRank }
   *   shuffle  : nouvelles cartes et révisions dans un ordre aléatoire
   *   deckRank : Map idPaquet → rang, pour garder l'ordre des paquets d'un dossier
   */
  constructor(cards, { now = Date.now(), newLimit = 20, reviewLimit = 200, settings = DEFAULT_SETTINGS, shuffle = false, rng = Math.random, deckRank = null } = {}) {
    this.settings = { ...DEFAULT_SETTINGS, ...settings };
    this.learn = cards.filter((c) => isLearning(c.srs)).sort(byDue);
    const review = cards
      .filter((c) => c.srs.state === 'review' && c.srs.due <= now)
      .sort(byDue)
      .slice(0, Math.max(0, reviewLimit));
    this.review = shuffle ? shuffled(review, rng) : review;
    const fresh = cards.filter((c) => c.srs.state === 'new');
    this.fresh = (shuffle ? shuffled(fresh, rng) : fresh.sort(byPosition(deckRank))).slice(0, Math.max(0, newLimit));
    this.sinceNew = 0;
    this.answered = 0;
    this.history = [];
  }

  get learnAheadMs() {
    return this.settings.learnAheadMinutes * MINUTE;
  }

  /** Nombre de cartes restantes par catégorie (pour l'en-tête). */
  counts(now = Date.now()) {
    return {
      fresh: this.fresh.length,
      learn: this.learn.filter((c) => c.srs.due <= now + this.learnAheadMs).length,
      review: this.review.length,
    };
  }

  /**
   * Prochaine carte à présenter.
   * @returns {{card, queue}|{wait:number, card}|null}
   *   - { card, queue } : carte à étudier maintenant
   *   - { wait, card }  : il ne reste que des cartes en apprentissage, la prochaine arrive dans `wait` ms
   *   - null            : séance terminée
   */
  next(now = Date.now()) {
    if (this.learn.length && this.learn[0].srs.due <= now) return { card: this.learn[0], queue: 'learn' };
    const pick = this.pickReviewOrNew();
    if (pick) return pick;
    if (this.learn.length) {
      const first = this.learn[0];
      if (first.srs.due <= now + this.learnAheadMs) return { card: first, queue: 'learn' };
      return { wait: first.srs.due - now, card: first };
    }
    return null;
  }

  pickReviewOrNew() {
    const r = this.review.length;
    const n = this.fresh.length;
    if (!r && !n) return null;
    if (!n) return { card: this.review[0], queue: 'review' };
    if (!r) return { card: this.fresh[0], queue: 'new' };
    // Répartit les nouvelles cartes régulièrement parmi les révisions.
    const every = Math.max(1, Math.floor(r / n));
    if (this.sinceNew >= every) return { card: this.fresh[0], queue: 'new' };
    return { card: this.review[0], queue: 'review' };
  }

  /**
   * Enregistre une réponse et met la carte à jour.
   * @returns {object} la carte avec son nouvel état `srs`
   */
  answer(card, rating, now = Date.now(), rng = Math.random) {
    this.history.push(this.snapshot(card));
    if (this.history.length > 20) this.history.shift();
    const prevState = card.srs.state;
    remove(this.learn, card.id);
    remove(this.review, card.id);
    const wasNew = remove(this.fresh, card.id);
    if (wasNew) this.sinceNew = 0;
    else if (prevState === 'review') this.sinceNew += 1;

    const updated = { ...card, srs: schedule(card.srs, rating, now, this.settings, rng) };
    if (isLearning(updated.srs)) {
      this.learn.push(updated);
      this.learn.sort(byDue);
    }
    this.answered += 1;
    return updated;
  }

  get canUndo() {
    return this.history.length > 0;
  }

  /** Annule la dernière réponse ; renvoie la carte dans son état précédent. */
  undo() {
    const snap = this.history.pop();
    if (!snap) return null;
    this.learn = snap.learn;
    this.review = snap.review;
    this.fresh = snap.fresh;
    this.sinceNew = snap.sinceNew;
    this.answered = snap.answered;
    return snap.card;
  }

  snapshot(card) {
    return {
      card: { ...card, srs: { ...card.srs } },
      learn: [...this.learn],
      review: [...this.review],
      fresh: [...this.fresh],
      sinceNew: this.sinceNew,
      answered: this.answered,
    };
  }

  /** Met à jour une carte modifiée pendant la séance (texte, image). */
  replace(card) {
    for (const q of [this.learn, this.review, this.fresh]) {
      const i = q.findIndex((c) => c.id === card.id);
      if (i >= 0) q[i] = { ...card, srs: q[i].srs };
    }
  }
}

function byDue(a, b) {
  return a.srs.due - b.srs.due;
}

/** Ordre « trié » : paquet par paquet, puis dans l'ordre des cartes. */
export function byPosition(deckRank = null) {
  const rank = (c) => (deckRank ? deckRank.get(c.deckId) ?? 0 : 0);
  return (a, b) => rank(a) - rank(b) || (a.position ?? a.createdAt ?? 0) - (b.position ?? b.createdAt ?? 0);
}

export function shuffled(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Cartes d'une séance sur un ou plusieurs paquets (un dossier), en respectant
 * les limites quotidiennes de chaque paquet.
 * @param {Array} decks paquets, dans l'ordre voulu
 * @param {Map<string, Array>} cardsByDeck cartes de chaque paquet
 * @param {Map<string, {fresh:number, review:number}>} doneByDeck déjà fait aujourd'hui
 * @param {{now?:number, shuffle?:boolean, rng?:() => number, extraNew?:number}} opts
 *   extraNew : au lieu des limites, prendre ce nombre de nouvelles cartes en plus
 */
export function selectForSession(decks, cardsByDeck, doneByDeck, { now = Date.now(), shuffle = false, rng = Math.random, extraNew = 0 } = {}) {
  const deckRank = new Map(decks.map((d, i) => [d.id, i]));
  const out = [];
  const allFresh = [];
  for (const deck of decks) {
    const cards = cardsByDeck.get(deck.id) || [];
    const done = doneByDeck.get(deck.id) || { fresh: 0, review: 0 };
    out.push(...cards.filter((c) => isLearning(c.srs)));
    const due = cards.filter((c) => c.srs.state === 'review' && c.srs.due <= now).sort(byDue);
    out.push(...due.slice(0, Math.max(0, (deck.reviewsPerDay ?? 200) - done.review)));
    const fresh = cards.filter((c) => c.srs.state === 'new');
    if (extraNew) allFresh.push(...fresh);
    else out.push(...(shuffle ? shuffled(fresh, rng) : fresh.sort(byPosition())).slice(0, Math.max(0, (deck.newPerDay ?? 20) - done.fresh)));
  }
  if (extraNew) out.push(...(shuffle ? shuffled(allFresh, rng) : allFresh.sort(byPosition(deckRank))).slice(0, extraNew));
  return { cards: out, deckRank };
}

function remove(list, id) {
  const i = list.findIndex((c) => c.id === id);
  if (i >= 0) {
    list.splice(i, 1);
    return true;
  }
  return false;
}

/**
 * Compte les cartes à étudier aujourd'hui pour un paquet.
 * `doneToday` = { fresh, review } : nombre de nouvelles cartes et de révisions déjà faites aujourd'hui.
 */
export function dueCounts(cards, { now = Date.now(), newPerDay = 20, reviewsPerDay = 200, doneToday = { fresh: 0, review: 0 }, settings = DEFAULT_SETTINGS } = {}) {
  const s = { ...DEFAULT_SETTINGS, ...settings };
  let fresh = 0;
  let learn = 0;
  let review = 0;
  for (const c of cards) {
    const st = c.srs.state;
    if (st === 'new') fresh += 1;
    else if (st === 'review') {
      if (c.srs.due <= now) review += 1;
    } else if (c.srs.due <= now + s.learnAheadMinutes * MINUTE) learn += 1;
  }
  return {
    fresh: Math.min(fresh, Math.max(0, newPerDay - doneToday.fresh)),
    learn,
    review: Math.min(review, Math.max(0, reviewsPerDay - doneToday.review)),
  };
}
