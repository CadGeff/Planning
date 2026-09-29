/* Semainier — applique le thème choisi avant le premier affichage (évite un flash clair/sombre).
   Chargé de façon synchrone dans <head> ; la CSP interdit les scripts en ligne, d'où ce fichier. */
(function () {
  try {
    var t = localStorage.getItem("semainier.theme");
    if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  } catch (e) { /* stockage indisponible : on suit le système */ }
})();
