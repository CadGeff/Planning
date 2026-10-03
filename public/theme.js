/* Semainier — exécuté de façon synchrone dans <head>, avant tout affichage.
   La CSP interdit les scripts en ligne, d'où ce fichier séparé. */
(function () {
  "use strict";
  // Anti-clickjacking, en secours de l'en-tête frame-ancestors (absent chez un hébergeur
  // qui n'applique pas _headers) : dans un cadre d'un autre site, la page se masque et tente d'en sortir.
  if (window.self !== window.top) {
    document.documentElement.style.display = "none";
    try {
      window.top.location = window.self.location.href;
    } catch {
      /* cadre bloqué : la page reste masquée */
    }
    return;
  }

  // Thème choisi (Auto / Clair / Sombre), appliqué avant le premier rendu pour éviter un flash.
  try {
    const t = localStorage.getItem("semainier.theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch {
    /* stockage indisponible : on suit le système */
  }
})();
