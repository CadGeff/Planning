// Bouton « retour » du téléphone ou du navigateur.
// Sans ce module, l'application n'a qu'une seule entrée dans l'historique : un retour quitte
// la page, et une application installée affiche alors un écran vide. Deux règles :
//   1. une fenêtre ou le menu sont ouverts : le retour les ferme ;
//   2. application installée, rien d'ouvert : le retour ne fait rien (on reste dans l'application).
// Dans un onglet de navigateur ordinaire, la règle 2 ne s'applique pas : le retour ramène
// à la page précédente, comme partout.

import { closeOpenDialog, anyDialogOpen } from "./dom.js";
import { closeMenu, isMenuOpen } from "./menu.js";

const OVERLAY = "overlay";
const GUARD = "guard";

const installed = () =>
  matchMedia("(display-mode: standalone)").matches || /** @type {any} */ (navigator).standalone === true;
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

export function initBack() {
  // Page rechargée pendant qu'une fenêtre était ouverte : son entrée ne représente plus rien.
  if (current() === OVERLAY) history.replaceState(installed() ? { semainier: GUARD } : null, "");
  // Application installée : une entrée de garde, pour que le premier retour reste dans l'application.
  if (installed() && current() !== GUARD) history.pushState({ semainier: GUARD }, "");

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
    // Rien d'ouvert : dans l'application installée, on reste sur place.
    if (installed() && current() !== GUARD) history.pushState({ semainier: GUARD }, "");
  });
}
