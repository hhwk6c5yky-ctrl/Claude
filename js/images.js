// Préparation des images : redimensionnement et compression avant stockage,
// pour qu'un paquet de 300 photos ne pèse pas 1 Go.
import { getImage, uid } from './db.js';

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;
const KEEP_ORIGINAL = new Set(['image/gif', 'image/svg+xml']);

/** Convertit un fichier image en enregistrement prêt pour IndexedDB. */
export async function prepareImage(file) {
  if (!file || !/^image\//.test(file.type || 'image/')) throw new Error('Ce fichier n’est pas une image.');
  const original = await file.arrayBuffer();
  if (KEEP_ORIGINAL.has(file.type)) {
    const dims = await measure(file).catch(() => ({ width: 0, height: 0 }));
    return { id: uid(), data: original, type: file.type, ...dims };
  }

  let bitmap;
  try {
    bitmap = await decode(file);
  } catch {
    throw new Error('Impossible de lire cette image. Essaie avec une photo au format JPEG ou PNG.');
  }
  const { width: w0, height: h0 } = bitmap;
  const scale = Math.min(1, MAX_DIMENSION / Math.max(w0, h0));
  const width = Math.max(1, Math.round(w0 * scale));
  const height = Math.max(1, Math.round(h0 * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff'; // fond blanc pour les PNG transparents
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('La compression de l’image a échoué.');
  // Garde l'original s'il est déjà plus léger et assez petit.
  if (scale === 1 && original.byteLength <= blob.size && /^image\/(jpeg|png|webp)$/.test(file.type)) {
    return { id: uid(), data: original, type: file.type, width, height };
  }
  return { id: uid(), data: await blob.arrayBuffer(), type: 'image/jpeg', width, height };
}

async function decode(file) {
  if (globalThis.createImageBitmap) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* repli ci-dessous */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

async function measure(file) {
  const img = await decode(file);
  return { width: img.width, height: img.height };
}

// ---------- Affichage ----------

const urlCache = new Map();

/** URL d'objet pour une image stockée (mise en cache). */
export async function imageUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const rec = await getImage(id);
  if (!rec) return null;
  const url = URL.createObjectURL(new Blob([rec.data], { type: rec.type }));
  urlCache.set(id, url);
  return url;
}

export function forgetImage(id) {
  const url = urlCache.get(id);
  if (url) URL.revokeObjectURL(url);
  urlCache.delete(id);
}

/** Libère la mémoire quand le cache grossit trop. */
export function trimImageCache(max = 150) {
  while (urlCache.size > max) {
    const [id] = urlCache.keys();
    forgetImage(id);
  }
}

/** URL temporaire pour un enregistrement pas encore stocké (aperçu dans l'éditeur). */
export function recordUrl(rec) {
  return URL.createObjectURL(new Blob([rec.data], { type: rec.type }));
}

// ---------- Conversion pour les sauvegardes ----------

export function bufferToBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}

export function base64ToBuffer(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}
