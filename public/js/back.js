// Bouton « retour » du téléphone ou du navigateur.
// Sans ce module, l'application n'a qu'une seule entrée dans l'historique : un retour quitte
// la page, et une application installée affiche alors un écran vide. Deux règles :
//   1. une fenêtre ou le menu sont ouverts : le retour les ferme ;
//   2. application lancée depuis son icône, rien d'ouvert : le retour ne fait rien (on reste
//      dans l'application).
// Quand on arrive d'une autre page, la règle 2 ne s'applique pas : le retour y ramène, comme partout.
//
// Deux contraintes des navigateurs :
// - Firefox pour Android ne dit pas à la page qu'elle tourne en application installée
//   (display-mode y vaut toujours « browser »). On le déduit donc aussi du contexte : écran
//   tactile et aucune page d'origine.
// - Au retour, les navigateurs sautent les entrées d'historique sur lesquelles l'utilisateur
//   n'a rien fait (protection contre les pages qui piègent le bouton retour). L'entrée de garde
//   n'est donc posée qu'après un premier clic, et on y revient avec forward() au lieu d'en
//   créer une nouvelle : chaque entrée utilisée a bien servi.

import { closeOpenDialog, anyDialogOpen } from "./dom.js";
import { closeMenu, isMenuOpen } from "./menu.js";

const OVERLAY = "overlay";
const GUARD = "guard";

/** Décision prise au chargement, gardée pour les rechargements de la même session. */
const GUARDED_KEY = "semainier.guarded";

/** Le navigateur déclare une application installée. */
const declaredInstalled = () =>
  ["standalone", "fullscreen", "minimal-ui"].some((mode) => matchMedia(`(display-mode: ${mode})`).matches) ||
  /** @type {any} */ (navigator).standalone === true ||
  document.referrer.startsWith("android-app://");

/**
 * À défaut de déclaration : un téléphone ou une tablette, sans page d'origine. C'est le cas
 * d'un lancement depuis l'icône (ou d'une adresse tapée, d'un favori) ; ce n'est pas celui
 * d'un visiteur arrivé par un lien depuis un autre site, à qui le retour reste acquis.
 * La longueur de l'historique n'est pas un indice fiable : une application installée peut
 * retrouver au lancement l'historique de sa session précédente.
 */
const looksInstalled = () => matchMedia("(pointer: coarse)").matches && document.referrer === "";

function decideGuarded() {
  try {
    if (sessionStorage.getItem(GUARDED_KEY) === "1") return true;
    const yes = declaredInstalled() || looksInstalled();
    if (yes) sessionStorage.setItem(GUARDED_KEY, "1");
    return yes;
  } catch {
    return declaredInstalled() || looksInstalled();
  }
}

/** Le retour doit-il rester dans l'application ? Fixé par initBack(). */
let guarded = false;
const installed = () => guarded;
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
  guarded = decideGuarded();
  // Page rechargée pendant qu'une fenêtre était ouverte : son entrée ne représente plus rien.
  if (current() === OVERLAY) history.replaceState(installed() ? { semainier: GUARD } : null, "");

  if (installed()) {
    // Après un premier clic ou une première touche, et pas avant : voir les contraintes en tête
    // de fichier. Un simple défilement ne compte pas comme une action pour le navigateur.
    const arm = () => {
      removeEventListener("click", arm, true);
      removeEventListener("keydown", arm, true);
      guard();
    };
    addEventListener("click", arm, true);
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
