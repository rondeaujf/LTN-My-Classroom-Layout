// Panneau flottant générique (menu contextuel, sélecteur de couleur,
// affectation d'élève, choix de bordure) : un seul panneau ouvert à la fois,
// positionné près du point de clic et refermé au clic extérieur / Échap.

let openEl = null;
let cleanup = null;

export function closeFloating() {
  if (openEl) {
    openEl.remove();
    openEl = null;
  }
  if (cleanup) {
    cleanup();
    cleanup = null;
  }
}

export function openFloating(x, y, className, build) {
  closeFloating();

  const panel = document.createElement("div");
  panel.className = `cll-floating ${className}`;
  panel.style.position = "fixed";
  panel.style.left = `${x}px`;
  panel.style.top = `${y}px`;
  document.body.appendChild(panel);
  openEl = panel;

  const close = () => closeFloating();
  build(panel, close);

  const rect = panel.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    panel.style.left = `${Math.max(0, x - rect.width)}px`;
  }
  if (rect.bottom > window.innerHeight) {
    panel.style.top = `${Math.max(0, y - rect.height)}px`;
  }

  // Différé d'un tick : le clic/contextmenu qui vient d'ouvrir le panneau ne
  // doit pas être capté par ce même listener et le refermer aussitôt.
  const onDocClick = (e) => {
    if (!panel.contains(e.target)) closeFloating();
  };
  const onKey = (e) => {
    if (e.key === "Escape") closeFloating();
  };
  setTimeout(() => document.addEventListener("click", onDocClick), 0);
  document.addEventListener("keydown", onKey);
  cleanup = () => {
    document.removeEventListener("click", onDocClick);
    document.removeEventListener("keydown", onKey);
  };

  return { close };
}
