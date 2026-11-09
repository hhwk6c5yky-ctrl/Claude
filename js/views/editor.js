import * as db from '../db.js';
import { makeCard } from '../store.js';
import { confirmDialog, h, icon, pickFile, toast } from '../ui.js';
import { goBack, navigate } from '../router.js';
import { screen } from './common.js';
import { forgetImage, imageUrl, prepareImage, recordUrl } from '../images.js';
import { hasMath, renderRich } from '../math.js';
import { symbolPicker } from '../symbols.js';

/**
 * Création (cardId = "new") ou modification d'une carte.
 */
export async function editorView({ deckId, cardId }) {
  const deck = await db.getDeck(deckId);
  if (!deck) throw new Error('Ce paquet n’existe plus.');
  const isNew = cardId === 'new';
  const existing = isNew ? null : await db.getCard(cardId);
  if (!isNew && !existing) throw new Error('Cette carte n’existe plus.');
  let addedCount = 0;

  const front = sideEditor('front', 'Recto', 'La question', existing?.front);
  const back = sideEditor('back', 'Verso', 'La réponse', existing?.back);

  const save = async () => {
    const f = front.value();
    const b = back.value();
    if (!f.text && !f.hasImage) {
      toast('Le recto est vide : ajoute un texte ou une image.');
      front.focus();
      return;
    }
    if (!b.text && !b.hasImage) {
      toast('Le verso est vide : ajoute un texte ou une image.');
      back.focus();
      return;
    }
    saveBtn.disabled = true;
    try {
      const frontSide = await front.commit();
      const backSide = await back.commit();
      if (isNew) {
        await db.putCard(makeCard(deckId, frontSide, backSide));
        addedCount += 1;
        front.reset();
        back.reset();
        counter.textContent = `${addedCount} carte${addedCount > 1 ? 's' : ''} ajoutée${addedCount > 1 ? 's' : ''}`;
        toast('Carte ajoutée. Tu peux enchaîner avec la suivante.');
        front.focus();
      } else {
        const updated = { ...existing, front: frontSide, back: backSide, updatedAt: Date.now() };
        await db.putCard(updated);
        // Supprime les images remplacées ou retirées.
        const kept = new Set(db.imageIds(updated));
        for (const id of db.imageIds(existing)) {
          if (!kept.has(id)) {
            forgetImage(id);
            await db.deleteImage(id);
          }
        }
        toast('Carte enregistrée.');
        goBack(`deck/${deckId}`);
      }
      db.putDeck(deck);
    } catch (err) {
      toast(err?.message || 'Enregistrement impossible.');
    } finally {
      saveBtn.disabled = false;
    }
  };

  const saveBtn = h('button.btn.primary.big', { type: 'button', onclick: save }, isNew ? 'Ajouter la carte' : 'Enregistrer');
  const counter = h('span.muted.small', { 'aria-live': 'polite' });

  const swapBtn = h('button.btn.ghost.small', {
    type: 'button',
    onclick: () => {
      const a = front.state();
      const b = back.state();
      front.load(b);
      back.load(a);
    },
  }, icon('swap'), 'Inverser recto et verso');

  const deleteBtn = isNew
    ? null
    : h('button.btn.danger.ghost', {
        type: 'button',
        onclick: async () => {
          if (!(await confirmDialog({ title: 'Supprimer cette carte ?', message: 'Elle sera supprimée définitivement, avec ses images.', confirmLabel: 'Supprimer', danger: true }))) return;
          for (const id of db.imageIds(existing)) forgetImage(id);
          await db.deleteCard(existing.id);
          toast('Carte supprimée.');
          goBack(`deck/${deckId}`);
        },
      }, icon('trash'), 'Supprimer');

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      save();
    }
  };
  document.addEventListener('keydown', onKey);

  const el = screen({
    title: isNew ? 'Nouvelle carte' : 'Modifier la carte',
    subtitle: deck.name,
    back: `deck/${deckId}`,
    body: h(
      'div.editor',
      front.el,
      back.el,
      h('div.editor-tools', swapBtn, deleteBtn),
      h('div.editor-footer', counter, isNew ? h('button.btn', { type: 'button', onclick: () => goBack(`deck/${deckId}`) }, 'Terminer') : null, saveBtn),
      h('p.small.muted', 'Formules : écris-les entre deux $, par exemple $x^2$, $\\frac{1}{2}$ ou $\\alpha$. Le bouton « Symboles » donne les lettres grecques et les signes mathématiques.'),
      h('p.small.muted.hint', 'Astuce : sur ordinateur, colle une capture d’écran directement dans un champ (Ctrl + V), et Ctrl + Entrée pour enregistrer.'),
    ),
    className: 'editor-screen',
  });

  return {
    el,
    focus: () => front.focus(),
    destroy: () => {
      document.removeEventListener('keydown', onKey);
      front.dispose();
      back.dispose();
    },
  };
}

/**
 * Éditeur d'une face : zone de texte + image (ajout, remplacement, suppression).
 */
function sideEditor(key, label, placeholder, initial) {
  // imageId : image déjà stockée ; pending : nouvelle image pas encore stockée
  let imageId = initial?.imageId || null;
  let pending = null;
  let previewUrl = null;

  const text = h('textarea.input.side-text', { id: `side-${key}`, rows: 3, placeholder, 'aria-label': `${label} : texte` }, initial?.text || '');
  const preview = h('div.side-image');
  const addBtn = h('button.btn.small', { type: 'button', onclick: () => choose() }, icon('image'), 'Ajouter une image');

  const renderImage = async () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      previewUrl = null;
    }
    let src = null;
    if (pending) src = previewUrl = recordUrl(pending);
    else if (imageId) src = await imageUrl(imageId);
    if (!src) {
      preview.replaceChildren();
      preview.hidden = true;
      addBtn.hidden = false;
      return;
    }
    preview.hidden = false;
    addBtn.hidden = true;
    preview.replaceChildren(
      h('img', { src, alt: `Image du ${label.toLowerCase()}` }),
      h(
        'div.side-image-actions',
        h('button.btn.small', { type: 'button', onclick: () => choose() }, 'Remplacer'),
        h('button.btn.small.danger.ghost', { type: 'button', onclick: () => { pending = null; imageId = null; renderImage(); } }, icon('trash'), 'Retirer'),
      ),
    );
  };

  const useFile = async (file) => {
    if (!file) return;
    try {
      addBtn.disabled = true;
      pending = await prepareImage(file);
      renderImage();
    } catch (err) {
      toast(err?.message || 'Image illisible.');
    } finally {
      addBtn.disabled = false;
    }
  };

  const choose = async () => useFile(await pickFile({ accept: 'image/*' }));

  // Aperçu des formules ($…$) pendant la saisie
  const mathPreview = h('div.math-preview', { hidden: true, 'aria-label': 'Aperçu de la formule' });
  let previewTimer;
  const updatePreview = () => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => {
      const show = hasMath(text.value);
      mathPreview.hidden = !show;
      if (show) {
        const p = h('p.face-text');
        renderRich(p, text.value);
        mathPreview.replaceChildren(h('span.label', 'Aperçu'), p);
      }
    }, 200);
  };
  text.addEventListener('input', updatePreview);

  const symbols = symbolPicker(() => text);

  const el = h(
    'section.side-editor',
    { 'aria-label': label },
    h('div.side-head', h('label', { for: `side-${key}` }, h('span.side-label', label), h('span.side-hint', placeholder))),
    h('div.bristol.side-body', text, symbols.panel, mathPreview, preview, h('div.side-tools', addBtn, symbols.button)),
  );

  // Coller une image (capture d'écran) ou la glisser-déposer
  el.addEventListener('paste', (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.kind === 'file' && i.type.startsWith('image/'));
    if (item) {
      e.preventDefault();
      useFile(item.getAsFile());
    }
  });
  el.addEventListener('dragover', (e) => {
    if ([...(e.dataTransfer?.items || [])].some((i) => i.kind === 'file')) {
      e.preventDefault();
      el.classList.add('drop');
    }
  });
  el.addEventListener('dragleave', () => el.classList.remove('drop'));
  el.addEventListener('drop', (e) => {
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
    el.classList.remove('drop');
    if (file) {
      e.preventDefault();
      useFile(file);
    }
  });

  renderImage();
  updatePreview();

  return {
    el,
    focus: () => text.focus(),
    value: () => ({ text: text.value.trim(), hasImage: Boolean(pending || imageId) }),
    state: () => ({ text: text.value, imageId, pending }),
    load: (s) => {
      text.value = s.text;
      imageId = s.imageId;
      pending = s.pending;
      renderImage();
      updatePreview();
    },
    reset: () => {
      text.value = '';
      imageId = null;
      pending = null;
      renderImage();
      updatePreview();
    },
    /** Stocke la nouvelle image et supprime l'ancienne si elle a été remplacée. */
    async commit() {
      if (pending) {
        await db.putImage(pending);
        imageId = pending.id;
        pending = null;
      }
      return { text: text.value.trim(), imageId };
    },
    dispose: () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      clearTimeout(previewTimer);
    },
  };
}
