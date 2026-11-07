// Répétition espacée : variante de l'algorithme SM-2 utilisée par Anki.
//
// Chaque carte passe par quatre états :
//   new        → jamais étudiée
//   learning   → en apprentissage (étapes courtes, en minutes)
//   review     → en révision (intervalles en jours, qui grandissent avec la facilité)
//   relearning → oubliée pendant une révision, repasse par des étapes courtes
//
// Les fonctions de ce module sont pures : elles prennent l'état d'une carte et
// renvoient un nouvel état, ce qui permet de les tester sans navigateur.

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

export const Rating = Object.freeze({ Again: 1, Hard: 2, Good: 3, Easy: 4 });

export const DEFAULT_SETTINGS = Object.freeze({
  learningSteps: [1, 10], // minutes
  relearningSteps: [10], // minutes
  graduatingInterval: 1, // jours
  easyInterval: 4, // jours
  startingEase: 2.5,
  minEase: 1.3,
  easyBonus: 1.3,
  hardMultiplier: 1.2,
  lapseMultiplier: 0, // nouvel intervalle après un oubli = ancien × ce facteur (minimum 1 jour)
  intervalModifier: 1,
  maximumInterval: 36500,
  dayStartHour: 4, // la journée de révision commence à 4 h du matin, comme dans Anki
  learnAheadMinutes: 20,
});

export function newSrs() {
  return { state: 'new', due: 0, interval: 0, ease: 0, step: 0, reps: 0, lapses: 0, lastReview: null };
}

/** Début de la journée de révision contenant `ts`. */
export function dayStart(ts, hour = DEFAULT_SETTINGS.dayStartHour) {
  const d = new Date(ts);
  d.setHours(hour, 0, 0, 0);
  if (d.getTime() > ts) d.setDate(d.getDate() - 1);
  return d.getTime();
}

/** Ajoute des jours calendaires (robuste aux changements d'heure). */
export function addDays(ts, days) {
  const d = new Date(ts);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function daysBetween(fromDayStart, toDayStart) {
  return Math.round((toDayStart - fromDayStart) / DAY);
}

function fuzzInterval(interval, rng) {
  if (interval < 3) return interval;
  const pct = interval < 7 ? 0.15 : interval < 30 ? 0.1 : 0.05;
  const range = Math.max(1, Math.round(interval * pct));
  return interval + Math.round((rng() * 2 - 1) * range);
}

function hardDelay(steps, step) {
  if (step === 0) {
    if (steps.length > 1) return (steps[0] + steps[1]) / 2;
    return Math.min(steps[0] * 1.5, steps[0] + 1440);
  }
  return steps[step];
}

function normalise(settings) {
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

/**
 * Calcule l'état d'une carte après une réponse.
 * @param {object} srs   état actuel (voir newSrs)
 * @param {number} rating 1 = À revoir, 2 = Difficile, 3 = Correct, 4 = Facile
 * @param {number} now   horodatage en ms
 * @param {object} settings réglages (DEFAULT_SETTINGS par défaut)
 * @param {() => number} rng source d'aléa pour le « fuzz » des intervalles
 */
export function schedule(srs, rating, now = Date.now(), settings = DEFAULT_SETTINGS, rng = Math.random) {
  const s = normalise(settings);
  const c = { ...newSrs(), ...srs };
  const today = dayStart(now, s.dayStartHour);
  c.reps += 1;
  c.lastReview = now;

  const graduate = (days) => {
    c.state = 'review';
    c.step = 0;
    c.interval = Math.max(1, Math.round(days));
    c.due = addDays(today, c.interval);
  };
  const stepTo = (minutes) => {
    c.due = now + Math.round(minutes * MINUTE);
  };

  if (c.state === 'new') {
    c.state = 'learning';
    c.step = 0;
    c.ease = s.startingEase;
  }

  if (c.state === 'learning' || c.state === 'relearning') {
    const relearn = c.state === 'relearning';
    const steps = relearn ? s.relearningSteps : s.learningSteps;
    const finish = (easy) => {
      if (relearn) graduate(easy ? c.interval + 1 : c.interval);
      else graduate(easy ? s.easyInterval : s.graduatingInterval);
    };
    if (!steps.length) {
      finish(rating === Rating.Easy);
      return c;
    }
    const step = Math.min(c.step, steps.length - 1);
    switch (rating) {
      case Rating.Again:
        c.step = 0;
        stepTo(steps[0]);
        break;
      case Rating.Hard:
        c.step = step;
        stepTo(hardDelay(steps, step));
        break;
      case Rating.Good:
        if (step + 1 < steps.length) {
          c.step = step + 1;
          stepTo(steps[c.step]);
        } else {
          finish(false);
        }
        break;
      case Rating.Easy:
        finish(true);
        break;
      default:
        throw new Error(`Note inconnue : ${rating}`);
    }
    return c;
  }

  // État « review »
  const late = Math.max(0, daysBetween(dayStart(c.due, s.dayStartHour), today));
  const cur = Math.max(1, c.interval);
  const constrain = (iv, min) => {
    const v = Math.round(iv * s.intervalModifier);
    return Math.min(s.maximumInterval, Math.max(min, v));
  };

  if (rating === Rating.Again) {
    c.lapses += 1;
    c.ease = Math.max(s.minEase, c.ease - 0.2);
    c.interval = Math.max(1, Math.round(cur * s.lapseMultiplier));
    if (s.relearningSteps.length) {
      c.state = 'relearning';
      c.step = 0;
      stepTo(s.relearningSteps[0]);
    } else {
      c.due = addDays(today, c.interval);
    }
    return c;
  }

  const hardIv = constrain(cur * s.hardMultiplier, cur + 1);
  const goodIv = constrain((cur + late / 2) * c.ease, hardIv + 1);
  const easyIv = constrain((cur + late) * c.ease * s.easyBonus, goodIv + 1);

  let iv;
  if (rating === Rating.Hard) {
    iv = hardIv;
    c.ease = Math.max(s.minEase, c.ease - 0.15);
  } else if (rating === Rating.Good) {
    iv = goodIv;
  } else if (rating === Rating.Easy) {
    iv = easyIv;
    c.ease += 0.15;
  } else {
    throw new Error(`Note inconnue : ${rating}`);
  }
  c.interval = Math.min(s.maximumInterval, Math.max(1, fuzzInterval(iv, rng)));
  c.due = addDays(today, c.interval);
  return c;
}

/** Délai affiché sur chaque bouton de réponse (sans aléa). */
export function previewIntervals(srs, now = Date.now(), settings = DEFAULT_SETTINGS) {
  const out = {};
  for (const r of [Rating.Again, Rating.Hard, Rating.Good, Rating.Easy]) {
    const next = schedule(srs, r, now, settings, () => 0.5);
    out[r] = next.state === 'review' ? formatDays(next.interval) : formatDuration(next.due - now);
  }
  return out;
}

export function formatDuration(ms) {
  const min = Math.max(0, Math.round(ms / MINUTE));
  if (min < 1) return '< 1 min';
  if (min < 60) return `${min} min`;
  const h = min / 60;
  if (h < 24) return `${formatNumber(h)} h`;
  return formatDays(min / 1440);
}

export function formatDays(days) {
  if (days < 1) return '< 1 j';
  if (days < 30) return `${Math.round(days)} j`;
  if (days < 365) return `${formatNumber(days / 30)} mois`;
  return `${formatNumber(days / 365)} an${days >= 730 ? 's' : ''}`;
}

function formatNumber(n) {
  const r = Math.round(n * 10) / 10;
  return (Number.isInteger(r) ? String(r) : r.toFixed(1)).replace('.', ',');
}

export function isLearning(srs) {
  return srs.state === 'learning' || srs.state === 'relearning';
}

/** Carte « acquise » : intervalle d'au moins 21 jours (définition d'Anki). */
export function isMature(srs) {
  return srs.state === 'review' && srs.interval >= 21;
}
