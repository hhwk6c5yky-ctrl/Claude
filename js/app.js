// Point d'entrée : routes, thème, service worker.
import { currentPath, isEmbedded, matchRoute, navigate, onRouteChange } from './router.js';
import { applyTheme, h } from './ui.js';
import { trimImageCache } from './images.js';
import { getPrefs } from './store.js';
import { requestPersistence } from './db.js';
import { homeView } from './views/home.js';
import { deckView } from './views/deck.js';
import { editorView } from './views/editor.js';
import { studyView } from './views/study.js';
import { practiceView } from './views/practice.js';
import { importView } from './views/import.js';
import { settingsView } from './views/settings.js';

const routes = [
  ['', homeView],
  ['deck/:deckId', deckView],
  ['deck/:deckId/study', studyView],
  ['deck/:deckId/practice', practiceView],
  ['deck/:deckId/card/:cardId', editorView],
  ['import', importView],
  ['import/:deckId', importView],
  ['settings', settingsView],
];

const root = document.getElementById('app');
let cleanup = null;
let renderToken = 0;

async function render(path) {
  const token = ++renderToken;
  let view = null;
  for (const [pattern, fn] of routes) {
    const params = matchRoute(pattern, path);
    if (params) {
      view = { fn, params };
      break;
    }
  }
  if (!view) {
    navigate('', { replace: true });
    return;
  }
  try {
    const result = await view.fn(view.params);
    if (token !== renderToken) {
      result?.destroy?.();
      return;
    }
    cleanup?.();
    cleanup = result?.destroy || null;
    trimImageCache();
    root.replaceChildren(result.el);
    window.scrollTo(0, 0);
    result.focus?.();
  } catch (err) {
    console.error(err);
    if (token !== renderToken) return;
    root.replaceChildren(
      h(
        'div.screen',
        h(
          'main.content.error-screen',
          h('h1', 'Quelque chose s’est mal passé'),
          h('p', err?.message || String(err)),
          h('button.btn.primary', { type: 'button', onclick: () => navigate('', { replace: true }) }, 'Retour à l’accueil'),
        ),
      ),
    );
  }
}

async function start() {
  try {
    applyTheme((await getPrefs()).theme);
  } catch (err) {
    root.replaceChildren(
      h('main.content.error-screen', h('h1', 'Stockage indisponible'), h('p', err?.message || String(err)), h('p', 'Si tu es en navigation privée, ouvre Mnémo dans une fenêtre normale.')),
    );
    return;
  }
  onRouteChange(render);
  render(currentPath());
  requestPersistence();
  if (!isEmbedded && 'serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

start();
