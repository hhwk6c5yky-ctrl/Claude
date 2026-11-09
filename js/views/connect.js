// Ouverture d'un lien de connexion (#/connect/…) créé sur un autre appareil.
import { connectGithub } from '../sync.js';
import { h, toast } from '../ui.js';
import { navigate } from '../router.js';
import { screen } from './common.js';

export async function connectView({ payload }) {
  // Retire tout de suite la clé de l'adresse et de l'historique.
  try {
    history.replaceState(history.state, '', '#/');
  } catch {
    /* cadre intégré : pas d'adresse à nettoyer */
  }
  const res = await connectGithub('', `#/connect/${payload}`);
  if (res.ok) {
    toast('Appareil connecté : tes cartes arrivent dans quelques secondes.', { duration: 5000 });
    navigate('', { replace: true });
  }
  const body = h(
    'div.study-message',
    h('h2', 'Connexion impossible'),
    h('p', res.message || ''),
    h('button.btn.primary', { type: 'button', onclick: () => navigate('settings', { replace: true }) }, 'Ouvrir les réglages'),
  );
  return { el: screen({ title: 'Synchronisation', back: '', body }) };
}
