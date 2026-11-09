// Lien (et QR code) pour connecter un autre appareil à la synchronisation GitHub
// sans retaper le dépôt ni la clé. Le lien contient la clé : il se garde comme
// un mot de passe. Il est placé après « # » : il n'est jamais envoyé au serveur.

/** Enlève les espaces, retours à la ligne et caractères invisibles collés avec la clé. */
export function cleanToken(s) {
  return String(s ?? '').replace(/[\s ​-‍⁠﻿]/g, '');
}

/** Enlève espaces et accents ajoutés par la correction automatique (« mnémo-données »). */
export function cleanRepoInput(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s ​-‍⁠﻿]/g, '')
    .replace(/[‐-―−]/g, '-'); // tirets « typographiques » → tiret simple
}

export function looksLikeToken(token) {
  return /^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token);
}

function toBase64Url(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4);
  const bin = atob(b64);
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeConnectPayload(repo, token) {
  return toBase64Url(JSON.stringify({ v: 1, r: repo, t: token }));
}

/** Adresse à ouvrir sur l'autre appareil. */
export function makeConnectLink(repo, token, base = location.origin + location.pathname) {
  return `${base}#/connect/${encodeConnectPayload(repo, token)}`;
}

/** Lit un lien de connexion (ou juste sa fin). Renvoie { repo, token } ou null. */
export function parseConnectCode(text) {
  const s = cleanToken(text);
  const m = /(?:#\/connect\/|^)([A-Za-z0-9_-]{30,})$/.exec(s);
  if (!m || looksLikeToken(s)) return null;
  try {
    const data = JSON.parse(fromBase64Url(m[1]));
    if (data && typeof data.r === 'string' && typeof data.t === 'string') return { repo: data.r, token: data.t };
  } catch {
    /* pas un lien de connexion */
  }
  return null;
}
