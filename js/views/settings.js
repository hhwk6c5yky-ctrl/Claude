import * as db from '../db.js';
import { getPrefs, getSettings, savePrefs, saveSettings } from '../store.js';
import { DEFAULT_SETTINGS } from '../srs.js';
import { buildBackup, backupFileName, restoreBackup, saveFile } from '../backup.js';
import { applyTheme, confirmDialog, h, pickFile, plural, toast } from '../ui.js';
import { navigate } from '../router.js';
import { screen, syncLabel } from './common.js';
import { getSyncStatus } from '../sync.js';
import { clampInt } from './deck.js';

export async function settingsView() {
  const [settings, prefs, estimate] = await Promise.all([getSettings(), getPrefs(), db.storageEstimate()]);
  let persisted = false;
  try {
    persisted = (await navigator.storage?.persisted?.()) || false;
  } catch {
    /* non pris en charge */
  }

  // ---------- Thème ----------
  const themes = [
    { id: 'auto', label: 'Automatique' },
    { id: 'light', label: 'Clair' },
    { id: 'dark', label: 'Sombre' },
  ];
  const themeGroup = h('div.segmented', { role: 'radiogroup', 'aria-label': 'Thème' });
  const paintTheme = (current) => {
    for (const b of themeGroup.children) b.setAttribute('aria-checked', String(b.dataset.id === current));
  };
  for (const t of themes) {
    themeGroup.append(
      h('button', { type: 'button', role: 'radio', dataset: { id: t.id }, onclick: async () => { applyTheme(t.id); paintTheme(t.id); await savePrefs({ theme: t.id }); } }, t.label),
    );
  }
  paintTheme(prefs.theme);

  // ---------- Algorithme ----------
  const stepsInput = (id, value) => h('input.input', { id, type: 'text', inputmode: 'numeric', value: value.join(' '), autocomplete: 'off' });
  const numInput = (id, value, min, max, step = 1) => h('input.input', { id, type: 'number', min, max, step, inputmode: 'decimal', value: String(value) });
  const fields = {
    learningSteps: stepsInput('set-learning', settings.learningSteps),
    relearningSteps: stepsInput('set-relearning', settings.relearningSteps),
    graduatingInterval: numInput('set-graduating', settings.graduatingInterval, 1, 365),
    easyInterval: numInput('set-easy', settings.easyInterval, 1, 365),
    maximumInterval: numInput('set-max', settings.maximumInterval, 1, 36500),
    startingEase: numInput('set-ease', settings.startingEase, 1.3, 5, 0.05),
  };
  const parseSteps = (v) =>
    v
      .split(/[\s,;]+/)
      .map((x) => parseFloat(x.replace(',', '.')))
      .filter((x) => Number.isFinite(x) && x > 0)
      .slice(0, 10);

  const saveAlgo = async () => {
    const learningSteps = parseSteps(fields.learningSteps.value);
    const relearningSteps = parseSteps(fields.relearningSteps.value);
    if (!learningSteps.length) {
      toast('Indique au moins une étape d’apprentissage (en minutes).');
      return;
    }
    const graduatingInterval = clampInt(fields.graduatingInterval.value, 1, 365, DEFAULT_SETTINGS.graduatingInterval);
    const easyInterval = Math.max(graduatingInterval, clampInt(fields.easyInterval.value, 1, 365, DEFAULT_SETTINGS.easyInterval));
    const startingEase = Math.min(5, Math.max(1.3, parseFloat(String(fields.startingEase.value).replace(',', '.')) || DEFAULT_SETTINGS.startingEase));
    await saveSettings({
      learningSteps,
      relearningSteps,
      graduatingInterval,
      easyInterval,
      maximumInterval: clampInt(fields.maximumInterval.value, 1, 36500, DEFAULT_SETTINGS.maximumInterval),
      startingEase,
    });
    toast('Réglages enregistrés.');
    navigate('settings', { replace: true });
  };

  const resetAlgo = async () => {
    await db.setMeta('settings', {});
    toast('Réglages par défaut rétablis.');
    navigate('settings', { replace: true });
  };

  const labeled = (label, input, help) => h('label.field', h('span.label', label), input, help ? h('span.help', help) : null);

  // ---------- Sauvegarde ----------
  const backupAll = async () => {
    try {
      const data = await buildBackup();
      if (!data.decks.length) {
        toast('Rien à sauvegarder pour l’instant.');
        return;
      }
      const res = await saveFile(backupFileName('tout'), JSON.stringify(data));
      await db.setMeta('lastBackup', Date.now());
      if (res !== 'cancelled') toast(`Sauvegarde créée : ${plural(data.decks.length, 'paquet')}, ${plural(data.cards.length, 'carte')}, ${plural(data.images.length, 'image')}.`);
    } catch (err) {
      toast(err?.message || 'La sauvegarde a échoué.');
    }
  };

  const restore = async () => {
    const file = await pickFile({ accept: '.json,application/json' });
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await file.text());
    } catch {
      toast('Ce fichier n’est pas une sauvegarde valide.');
      return;
    }
    const ok = await confirmDialog({
      title: 'Restaurer cette sauvegarde ?',
      message: `Elle contient ${plural(data?.decks?.length || 0, 'paquet')} et ${plural(data?.cards?.length || 0, 'carte')}. Les paquets déjà présents sur cet appareil avec le même identifiant seront remplacés ; les autres sont conservés.`,
      confirmLabel: 'Restaurer',
    });
    if (!ok) return;
    try {
      const res = await restoreBackup(data);
      toast(`Restauré : ${plural(res.decks, 'paquet')}, ${plural(res.cards, 'carte')}.`);
      navigate('', { replace: true });
    } catch (err) {
      toast(err?.message || 'La restauration a échoué.');
    }
  };

  const lastBackup = await db.getMeta('lastBackup', null);
  const usage = estimate?.usage != null ? `${formatBytes(estimate.usage)} utilisés sur cet appareil` : null;

  const st = getSyncStatus();
  const syncOn = !['unsupported', 'unavailable', 'idle'].includes(st.state);
  const syncPanel = syncOn
    ? h(
        'section.panel',
        h('h2', 'Synchronisation'),
        h('p.sync-line', h('span', { class: `sync-pill tone-${syncLabel(st)?.tone || 'busy'}` }), h('strong.sync-text', syncLabel(st)?.text || '')),
        h('p', 'Tes paquets, tes cartes, tes images et ta progression sont enregistrés dans ton compte Claude. Ouvre ce même lien sur ton téléphone et ton ordinateur, connecté avec le même compte : tout apparaît des deux côtés, en quelques secondes.'),
        h('p.small.muted', 'Une copie reste aussi sur chaque appareil, et les changements faits hors connexion partent dès le retour du réseau. Si une même carte est modifiée sur deux appareils, la modification la plus récente l’emporte.'),
      )
    : h(
        'section.panel',
        h('h2', 'Synchronisation'),
        h('p', st.state === 'unavailable'
          ? 'La synchronisation demande d’être connecté à ton compte Claude. Connecte-toi puis recharge la page.'
          : 'Dans cette version, tes cartes restent sur cet appareil. Pour les retrouver automatiquement sur ton téléphone et ton ordinateur, utilise Mnémo depuis son lien claude.ai. Sinon, passe par « Tout sauvegarder » puis « Restaurer une sauvegarde ».'),
      );

  const body = h(
    'div.settings',
    syncPanel,
    h(
      'section.panel',
      h('h2', 'Sauvegarde'),
      h('p', syncOn ? 'Garde aussi de temps en temps une sauvegarde dans un fichier : c’est ta copie de secours, utilisable dans n’importe quelle version de Mnémo.' : 'Tes cartes sont enregistrées uniquement dans ce navigateur, sur cet appareil. Fais une sauvegarde de temps en temps pour ne rien perdre, ou pour passer tes paquets sur un autre appareil.'),
      h('div.button-row.left', h('button.btn.primary', { type: 'button', onclick: backupAll }, 'Tout sauvegarder'), h('button.btn', { type: 'button', onclick: restore }, 'Restaurer une sauvegarde')),
      h('p.small.muted', lastBackup ? `Dernière sauvegarde : ${new Date(lastBackup).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}.` : 'Aucune sauvegarde faite depuis cet appareil.', usage ? ` ${usage}.` : '', persisted ? ' Stockage protégé contre l’effacement automatique.' : ''),
      !persisted && !syncOn ? h('p.small.muted', 'Sur iPhone, ajoute Mnémo à l’écran d’accueil (bouton Partager → « Sur l’écran d’accueil ») : Safari efface sinon les données des sites inutilisés pendant plusieurs semaines.') : null,
    ),
    h('section.panel', h('h2', 'Affichage'), h('div.field', h('span.label', 'Thème'), themeGroup)),
    h(
      'section.panel',
      h('h2', 'Répétition espacée'),
      h('p.small', 'Mnémo planifie chaque carte comme Anki (algorithme SM-2). Une carte nouvelle passe par des étapes courtes, puis revient après 1 jour, puis à des intervalles de plus en plus longs tant que tu la sais. Si tu l’oublies, elle repart sur des intervalles courts.'),
      h(
        'div.form',
        h('div.field-row', labeled('Étapes d’apprentissage (min)', fields.learningSteps, 'Ex. : 1 10'), labeled('Étapes après un oubli (min)', fields.relearningSteps, 'Ex. : 10')),
        h('div.field-row', labeled('Premier intervalle (jours)', fields.graduatingInterval), labeled('Intervalle « Facile » (jours)', fields.easyInterval)),
        h('div.field-row', labeled('Intervalle maximum (jours)', fields.maximumInterval), labeled('Facilité de départ', fields.startingEase, '2,5 par défaut')),
      ),
      h('p.small.muted', 'Le nombre de nouvelles cartes par jour se règle dans chaque paquet (menu ⋯).'),
      h('div.button-row.left', h('button.btn.primary', { type: 'button', onclick: saveAlgo }, 'Enregistrer'), h('button.btn.ghost', { type: 'button', onclick: resetAlgo }, 'Valeurs par défaut')),
    ),
    h(
      'section.panel',
      h('h2', 'Raccourcis clavier'),
      h(
        'dl.shortcuts',
        h('div', h('dt', h('kbd', 'Espace')), h('dd', 'Afficher la réponse')),
        h('div', h('dt', h('kbd', '1'), ' à ', h('kbd', '4')), h('dd', 'À revoir, Difficile, Correct, Facile')),
        h('div', h('dt', h('kbd', 'Z')), h('dd', 'Annuler la dernière réponse')),
        h('div', h('dt', h('kbd', 'E')), h('dd', 'Modifier la carte en cours')),
        h('div', h('dt', h('kbd', 'Ctrl'), ' + ', h('kbd', 'Entrée')), h('dd', 'Enregistrer une carte dans l’éditeur')),
      ),
    ),
  );

  return { el: screen({ title: 'Réglages', back: '', body, className: 'settings-screen' }) };
}

function formatBytes(n) {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} Ko`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2).replace('.', ',')} Go`;
}
