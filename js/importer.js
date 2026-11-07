// Analyse du texte exporté par Quizlet (et de tout fichier texte / CSV / TSV).
//
// Quizlet → ⋯ → Exporter propose :
//   - entre le terme et la définition : Tabulation, Virgule ou Personnalisé
//   - entre les lignes : Nouvelle ligne, Point-virgule ou Personnalisé
// Les mêmes réglages se retrouvent ici.

export const TERM_SEPARATORS = { tab: '\t', comma: ',', dash: ' - ' };
export const ROW_SEPARATORS = { newline: '\n', semicolon: ';', blank: '\n\n' };

/** Transforme « \t », « \n » tapés par l'utilisateur en vrais caractères. */
export function unescapeSeparator(s) {
  return String(s ?? '')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r');
}

export function normaliseNewlines(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n').replace(/\u2028|\u2029/g, '\n');
}

/** Devine les séparateurs utilisés dans un texte collé. */
export function detectSeparators(text) {
  const t = normaliseNewlines(text).trim();
  const lines = t.split('\n').filter((l) => l.trim());
  const share = (pred) => (lines.length ? lines.filter(pred).length / lines.length : 0);

  let term = '\t';
  if (t.includes('\t')) term = '\t';
  else if (share((l) => l.includes(' - ')) >= 0.6) term = ' - ';
  else if (share((l) => l.includes(',')) >= 0.6) term = ',';
  else if (share((l) => l.includes(':')) >= 0.6) term = ':';

  let row = '\n';
  if (lines.length <= 1 && t.includes(';') && term !== ';') row = ';';
  return { term, row };
}

/**
 * Découpe le texte en cartes.
 * @param {string} text
 * @param {{term?: string, row?: string, swap?: boolean}} opts
 * @returns {{cards: Array<{front: string, back: string}>, skipped: string[]}}
 */
export function parseCards(text, { term = '\t', row = '\n', swap = false } = {}) {
  const src = normaliseNewlines(text);
  term = normaliseNewlines(term);
  row = normaliseNewlines(row);
  if (!term) throw new Error('Le séparateur entre terme et définition est vide.');
  if (!row) throw new Error('Le séparateur entre les cartes est vide.');

  const pairs = [];
  const skipped = [];

  if (term === ',' && row === '\n') {
    for (const fields of parseCsv(src)) {
      if (fields.every((f) => !f.trim())) continue;
      if (fields.length < 2) {
        skipped.push(fields.join(','));
        continue;
      }
      pairs.push([fields[0], fields.slice(1).join(', ')]);
    }
  } else if (row === '\n') {
    // Une carte par ligne. Une ligne sans séparateur prolonge la définition
    // précédente : Quizlet exporte ainsi les définitions sur plusieurs lignes.
    for (const line of src.split('\n')) {
      const i = line.indexOf(term);
      if (i >= 0) {
        pairs.push([line.slice(0, i), line.slice(i + term.length)]);
      } else if (line.trim()) {
        if (pairs.length) pairs[pairs.length - 1][1] += '\n' + line;
        else skipped.push(line);
      }
    }
  } else {
    for (const chunk of src.split(row)) {
      if (!chunk.trim()) continue;
      const i = chunk.indexOf(term);
      if (i < 0) {
        skipped.push(chunk.trim());
        continue;
      }
      pairs.push([chunk.slice(0, i), chunk.slice(i + term.length)]);
    }
  }

  const cards = [];
  for (const [a, b] of pairs) {
    const front = cleanField(a);
    const back = cleanField(b);
    if (!front && !back) continue;
    if (!front || !back) {
      skipped.push(front || back);
      continue;
    }
    cards.push(swap ? { front: back, back: front } : { front, back });
  }
  return { cards, skipped };
}

function cleanField(s) {
  return s
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
    .trim();
}

/** Analyseur CSV minimal (RFC 4180) : guillemets, guillemets doublés, retours à la ligne dans un champ. */
export function parseCsv(text, sep = ',') {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  let atFieldStart = true;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && atFieldStart) {
      quoted = true;
      atFieldStart = false;
    } else if (ch === sep) {
      row.push(field);
      field = '';
      atFieldStart = true;
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      atFieldStart = true;
    } else {
      field += ch;
      if (ch !== ' ') atFieldStart = false;
    }
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Texte au format d'export Quizlet (tabulation + nouvelle ligne), pour l'export inverse. */
export function toTsv(cards) {
  const esc = (s) => String(s ?? '').replace(/\t/g, ' ');
  return cards.map((c) => `${esc(c.front)}\t${esc(c.back)}`).join('\n');
}
