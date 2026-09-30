/* Semainier — exécuté de façon synchrone dans <head>, avant tout affichage.
   La CSP interdit les scripts en ligne, d'où ce fichier. */
(function () {
  // Anti-clickjacking : GitHub Pages ne permet pas l'en-tête frame-ancestors, et la balise
  // <meta> CSP ne le prend pas en charge. Si la page est chargée dans un cadre d'un autre
  // site, on la masque et on tente d'en sortir.
  if (window.self !== window.top) {
    document.documentElement.style.display = "none";
    try { window.top.location = window.self.location.href; } catch (e) { /* cadre bloqué : la page reste masquée */ }
    return;
  }

  // Thème choisi (Auto / Clair / Sombre), appliqué avant le premier rendu pour éviter un flash.
  try {
    var t = localStorage.getItem("semainier.theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* stockage indisponible : on suit le système */ }
})();
