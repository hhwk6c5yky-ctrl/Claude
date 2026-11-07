// Navigation par l'ancre de l'URL (#/deck/…). Dans un cadre intégré (aperçu),
// l'URL n'est pas modifiable : la navigation se fait alors en mémoire.

let embedded = false;
try {
  embedded = window.self !== window.top;
} catch {
  embedded = true;
}

/** Vrai quand l'appli tourne dans un cadre intégré (aperçu) : pas d'URL ni de téléchargement. */
export const isEmbedded = embedded;

const memoryStack = [];
let memoryPath = '';
let listener = () => {};

export function onRouteChange(fn) {
  listener = fn;
  if (!embedded) {
    window.addEventListener('popstate', () => listener(currentPath()));
    window.addEventListener('hashchange', () => listener(currentPath()));
  }
}

export function currentPath() {
  if (embedded) return memoryPath;
  return decodeURIComponent(location.hash.replace(/^#\/?/, ''));
}

export function navigate(path, { replace = false } = {}) {
  if (embedded) {
    if (!replace) memoryStack.push(memoryPath);
    memoryPath = path;
  } else {
    const depth = (history.state?.depth ?? 0) + (replace ? 0 : 1);
    const url = path ? `#/${path}` : location.pathname + location.search;
    history[replace ? 'replaceState' : 'pushState']({ depth }, '', url);
  }
  listener(currentPath());
}

/** Revient à l'écran précédent, ou à `parent` si on est arrivé directement ici. */
export function goBack(parent = '') {
  if (embedded) {
    memoryPath = memoryStack.length ? memoryStack.pop() : parent;
    listener(memoryPath);
    return;
  }
  if ((history.state?.depth ?? 0) > 0) history.back();
  else navigate(parent, { replace: true });
}

/** Associe un chemin à un motif « deck/:id/card/:cardId ». */
export function matchRoute(pattern, path) {
  const p = pattern.split('/').filter(Boolean);
  const s = path.split('/').filter(Boolean);
  if (p.length !== s.length) return null;
  const params = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = s[i];
    else if (p[i] !== s[i]) return null;
  }
  return params;
}
