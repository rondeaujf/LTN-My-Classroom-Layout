// Generic floating panel (context menu, color picker, student assignment,
// border choice): only one panel open at a time, positioned near the click
// point and closed on outside click / Escape.

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

  // Deferred by one tick: the click/contextmenu that just opened the panel
  // must not be caught by this same listener and close it right away.
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
