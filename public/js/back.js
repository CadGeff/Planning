// Bouton « retour » du téléphone ou du navigateur.
// Sans ce module, l'application n'a qu'une seule entrée dans l'historique : un retour quitte
// la page, et une application installée affiche alors un écran vide. Deux règles :
//   1. une fenêtre ou le menu sont ouverts : le retour les ferme ;
//   2. application installée, rien d'ouvert : le retour ne fait rien (on reste dans l'application).
// Dans un onglet de navigateur ordinaire, la règle 2 ne s'applique pas : le retour ramène
// à la page précédente, comme partout.
//
// Contrainte des navigateurs : au retour, ils sautent les entrées d'historique sur lesquelles
// l'utilisateur n'a rien touché (protection contre les pages qui piègent le bouton retour).
// L'entrée de garde n'est donc posée qu'au premier geste, et on y revient avec forward()
// au lieu d'en créer une nouvelle : chaque entrée utilisée a bien été touchée.

import { closeOpenDialog, anyDialogOpen } from "./dom.js";
import { closeMenu, isMenuOpen } from "./menu.js";

const OVERLAY = "overlay";
const GUARD = "guard";

/** Application lancée depuis son icône (installée), et non dans un onglet de navigateur. */
const installed = () =>
  ["standalone", "fullscreen", "minimal-ui"].some((mode) => matchMedia(`(display-mode: ${mode})`).matches) ||
  /** @type {any} */ (navigator).standalone === true ||
  document.referrer.startsWith("android-app://");
const somethingOpen = () => anyDialogOpen() || isMenuOpen();
const current = () => history.state?.semainier;

/** Retours déclenchés par ce module lui-même, à ne pas traiter comme un geste de l'utilisateur. */
let selfBack = 0;

/** Une fenêtre s'ouvre ou se ferme : l'historique suit, pour que le retour ait quelque chose à défaire. */
function sync() {
  const open = somethingOpen();
  if (open && current() !== OVERLAY) history.pushState({ semainier: OVERLAY }, "");
  else if (!open && current() === OVERLAY) {
    // Fermée par l'interface (bouton, Échap, clic à côté) : on retire l'entrée devenue inutile.
    selfBack++;
    history.back();
  }
}

/** Pose l'entrée de garde, si elle n'est pas déjà l'entrée courante. */
function guard() {
  if (current() !== GUARD && current() !== OVERLAY) history.pushState({ semainier: GUARD }, "");
}

/**
 * Le retour a quitté l'entrée de garde : on y revient. L'entrée existe encore juste après
 * celle-ci ; si ce n'est pas le cas (historique modifié par ailleurs), on la recrée.
 */
function reanchor() {
  history.forward();
  setTimeout(guard, 150);
}

export function initBack() {
  // Page rechargée pendant qu'une fenêtre était ouverte : son entrée ne représente plus rien.
  if (current() === OVERLAY) history.replaceState(installed() ? { semainier: GUARD } : null, "");

  if (installed()) {
    // Au premier geste, et pas avant : voir la contrainte décrite en tête de fichier.
    const arm = () => {
      removeEventListener("pointerdown", arm, true);
      removeEventListener("keydown", arm, true);
      guard();
    };
    addEventListener("pointerdown", arm, true);
    addEventListener("keydown", arm, true);
  }

  // Toutes les fenêtres et le menu s'ouvrent en retirant l'attribut « hidden » : on l'observe.
  const watched = [...document.querySelectorAll(".scrim"), document.getElementById("menu")];
  const observer = new MutationObserver(sync);
  for (const node of watched) if (node) observer.observe(node, { attributes: true, attributeFilter: ["hidden"] });

  window.addEventListener("popstate", () => {
    if (selfBack > 0) {
      selfBack--;
      // Une fenêtre a pu se rouvrir entre-temps : elle retrouve son entrée.
      sync();
      return;
    }
    if (somethingOpen()) {
      // Le retour vient de quitter l'entrée de la fenêtre : on ferme ce qu'elle représentait.
      if (!closeOpenDialog()) closeMenu(true);
      return;
    }
    if (current() === OVERLAY) {
      // Arrivée par « avancer » sur l'entrée d'une fenêtre déjà fermée : on n'y reste pas.
      selfBack++;
      history.back();
      return;
    }
    // Rien d'ouvert : dans l'application installée, on reste sur place.
    if (installed() && current() !== GUARD) reanchor();
  });
}
