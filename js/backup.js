// Sauvegarde complète (paquets, cartes, progression, images) dans un fichier JSON.
import * as db from './db.js';
import { base64ToBuffer, bufferToBase64 } from './images.js';
import { isEmbedded } from './router.js';

export const BACKUP_FORMAT = 'mnemo-backup';
export const BACKUP_VERSION = 1;

/** Construit l'objet de sauvegarde. Sans `deckIds`, sauvegarde tout. */
export async function buildBackup(deckIds = null) {
  let decks = await db.getDecks();
  if (deckIds) decks = decks.filter((d) => deckIds.includes(d.id));
  const keep = new Set(decks.map((d) => d.id));
  const cards = (await db.getAllCards()).filter((c) => keep.has(c.deckId));
  const logs = (await db.getAllLogs()).filter((l) => keep.has(l.deckId));
  const ids = [...new Set(cards.flatMap(db.imageIds))];
  const images = (await db.getImages(ids)).filter(Boolean).map((img) => ({
    id: img.id,
    type: img.type,
    width: img.width,
    height: img.height,
    data: bufferToBase64(img.data),
  }));
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    decks,
    cards,
    images,
    logs,
  };
}

/** Restaure une sauvegarde. Les éléments existants avec le même identifiant sont remplacés. */
export async function restoreBackup(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || data.format !== BACKUP_FORMAT) throw new Error('Ce fichier n’est pas une sauvegarde Mnémo.');
  if (data.version > BACKUP_VERSION) throw new Error('Cette sauvegarde vient d’une version plus récente de Mnémo. Mets l’appli à jour.');
  const images = (data.images || []).map((img) => ({ ...img, data: base64ToBuffer(img.data) }));
  await db.bulkImport({ decks: data.decks || [], cards: data.cards || [], images, logs: data.logs || [] });
  return { decks: (data.decks || []).length, cards: (data.cards || []).length, images: images.length };
}

/** Propose le fichier au téléchargement (ou au partage sur mobile). */
export async function saveFile(name, text, type = 'application/json') {
  if (isEmbedded) {
    throw new Error('Le téléchargement n’est pas possible dans cet aperçu. Ouvre Mnémo depuis son adresse (ou l’appli installée) pour sauvegarder.');
  }
  const blob = new Blob([text], { type });
  const file = typeof File === 'function' ? new File([blob], name, { type }) : null;
  // Sur iPhone, le partage permet d'enregistrer dans Fichiers ou iCloud Drive.
  if (file && navigator.canShare?.({ files: [file] }) && matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e?.name === 'AbortError') return 'cancelled';
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return 'downloaded';
}

export function backupFileName(label = 'sauvegarde') {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const slug = label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 40) || 'paquet';
  return `mnemo-${slug}-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`;
}
