# Mnémo : flashcards à répétition espacée

Mnémo est une appli de flashcards qui fonctionne dans le navigateur, sur téléphone comme sur ordinateur, même hors connexion. Elle reprend la méthode d'Anki (répétition espacée et mémoire active) et permet d'importer ses sets Quizlet.

## Ce que fait l'appli

- **Répétition espacée** comme dans Anki (algorithme SM-2). Après chaque carte, tu indiques si tu as répondu *À revoir*, *Difficile*, *Correct* ou *Facile*. Mnémo calcule quand la carte doit revenir : quelques minutes pour une carte ratée, puis 1 jour, 3 jours, 1 semaine, 1 mois… tant que tu la sais. Chaque bouton affiche le délai correspondant.
- **Mémoire active** : tu cherches la réponse avant de la voir. Tu peux aussi l'écrire au clavier : l'appli la vérifie, en tolérant les majuscules, une faute de frappe ou un accent oublié (elle te le signale quand même).
- **Photos au recto et/ou au verso** : prends une photo, choisis une image de la galerie ou colle une capture d'écran (Ctrl + V sur ordinateur). Les images sont redimensionnées et compressées automatiquement. Touche une image pendant la révision pour l'agrandir.
- **Maths et alphabet grec** : un clavier « Symboles » (lettres grecques, opérations, ensembles, exposants et indices, géométrie) s'ouvre sous chaque champ, y compris pour écrire une réponse. Les formules s'écrivent entre deux `$` comme dans Anki : `$\frac{1}{2}$`, `$x^2$`, `$\sqrt{2}$`, ou `$$…$$` pour une formule centrée. Elles s'affichent avec KaTeX, livré avec l'appli (marche hors connexion), et un aperçu apparaît pendant la saisie. En mode écriture, `α` est accepté pour une réponse écrite `$\alpha$`.
- **Import Quizlet** : colle le texte exporté par Quizlet. Les séparateurs sont détectés automatiquement et un aperçu montre les cartes avant l'import. Les fichiers texte d'Anki et les CSV marchent aussi.
- **Entraînement libre** (comme Quizlet) : retourner les cartes, écrire la réponse ou QCM, dans un sens ou dans l'autre. Les cartes ratées reviennent jusqu'à ce qu'elles soient sues. Ce mode ne modifie pas ton planning de révision.
- **Annuler** la dernière réponse en cas d'erreur de doigt, **modifier** une carte en pleine révision.
- **Sauvegarde** de tous tes paquets, images et progression comprises, dans un fichier `.json`, pour ne rien perdre ou passer sur un autre appareil.
- Thème clair ou sombre, raccourcis clavier (`Espace` pour la réponse, `1` à `4` pour noter, `Z` pour annuler).

Tes données restent sur ton appareil (stockage du navigateur). Il n'y a ni compte ni serveur.

## Importer un set Quizlet

1. Ouvre **quizlet.com** dans un navigateur. L'export n'existe pas dans l'appli mobile Quizlet ; sur téléphone, demande la « version pour ordinateur » du site.
2. Ouvre ton set, appuie sur **⋯** puis **Exporter**.
3. Garde les réglages par défaut (**Tabulation** entre terme et définition, **Nouvelle ligne** entre les cartes) et appuie sur **Copier le texte**.
4. Dans Mnémo : bouton **Importer** (flèche vers le bas, en haut de l'accueil), colle le texte, vérifie l'aperçu, donne un nom au paquet et valide.

Si tes définitions font plusieurs lignes, choisis dans Quizlet un séparateur personnalisé entre les cartes (par exemple `###`) et indique le même dans Mnémo.

Quizlet n'exporte pas les images. Après l'import, ouvre une carte pour lui ajouter sa photo.

## Mettre l'appli en ligne (pour l'utiliser sur ton téléphone)

L'appli est un simple site statique : pas besoin de serveur ni de compilation.

**Avec GitHub Pages**

1. Sur GitHub, ouvre le dépôt → **Settings** → **Pages**.
2. Dans **Build and deployment**, choisis **Deploy from a branch**, branche `main`, dossier `/ (root)`, puis **Save**.
3. Au bout d'une minute, l'adresse du site s'affiche en haut de cette page (du type `https://<ton-pseudo>.github.io/<nom-du-depot>/`).

GitHub Pages est gratuit pour un dépôt **public**. Pour un dépôt privé, il faut GitHub Pro, offert aux lycéens et étudiants avec le [GitHub Student Developer Pack](https://education.github.com/pack).

**Sans GitHub** : n'importe quel hébergeur de site statique convient (par exemple Netlify Drop : on glisse le dossier du projet dans la page et on obtient une adresse).

### Installer sur l'écran d'accueil

- **iPhone (Safari)** : bouton Partager → **Sur l'écran d'accueil**. C'est important sur iPhone : sans ça, Safari peut effacer les données d'un site qu'on n'a pas ouvert depuis plusieurs semaines.
- **Android (Chrome)** : menu ⋮ → **Installer l'application**.

Une fois installée, l'appli s'ouvre en plein écran et marche sans connexion.

## Sauvegarder ses cartes

Les cartes sont stockées dans le navigateur de l'appareil. Pense à faire régulièrement **Réglages → Tout sauvegarder** : tu obtiens un fichier `.json` à garder dans tes fichiers ou sur un cloud. **Restaurer une sauvegarde** le recharge sur n'importe quel appareil.

## Comment marche la répétition espacée

| Situation | Ce qui se passe |
| --- | --- |
| Nouvelle carte | Étapes d'apprentissage : 1 min puis 10 min |
| Étapes réussies | La carte passe en révision : elle revient dans 1 jour (4 jours si *Facile*) |
| *Correct* en révision | Intervalle × facilité (2,5 au départ) : 1 j → 3 j → 8 j → 20 j → 50 j → … |
| *Difficile* | Intervalle × 1,2 et la carte devient un peu plus « difficile » |
| *À revoir* (oubli) | Retour à une étape courte (10 min), puis on repart de 1 jour |

Une journée de révision commence à 4 h du matin. Chaque paquet a une limite de nouvelles cartes par jour (20 par défaut, modifiable dans le menu ⋯ du paquet) ; à la fin d'une séance, tu peux en étudier 10 de plus, ce qui est pratique avant un contrôle. Les étapes et intervalles se règlent dans **Réglages**.

## Pour les développeurs

Aucune dépendance : HTML, CSS et modules JavaScript natifs.

```sh
# lancer en local (les modules ES ne marchent pas en file://)
python3 -m http.server 8000
# puis ouvrir http://localhost:8000

# tests unitaires (Node 18 ou plus)
npm test
```

| Fichier | Rôle |
| --- | --- |
| `js/srs.js` | Algorithme de répétition espacée (fonctions pures) |
| `js/session.js` | File d'attente d'une séance : nouvelles cartes, apprentissage, révisions, annulation |
| `js/importer.js` | Lecture du texte Quizlet / Anki / CSV |
| `js/answer.js` | Vérification des réponses écrites |
| `js/math.js` | Formules : détection des `$…$`, rendu KaTeX, conversion en texte |
| `js/symbols.js` | Clavier de symboles (grec, maths) |
| `vendor/katex/` | KaTeX 0.16.11 (licence MIT) |
| `js/db.js` | Stockage IndexedDB (paquets, cartes, images, historique) |
| `js/images.js` | Redimensionnement et compression des photos |
| `js/backup.js` | Sauvegarde et restauration au format JSON |
| `js/views/` | Écrans de l'appli |
| `sw.js` | Service worker (fonctionnement hors connexion) |

Quand tu modifies un fichier de l'appli, change `VERSION` dans `sw.js` pour que les appareils qui l'ont installée récupèrent la nouvelle version.
