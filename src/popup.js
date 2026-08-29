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

// A native <dialog> opened with showModal() is promoted to the browser's
// "top layer", painted above all regular content regardless of z-index —
// and everything outside it becomes inert (unclickable), including a panel
// appended to document.body. So when the module is itself hosted inside an
// open modal dialog (e.g. a host app's own dialog system), the floating
// panel must be appended inside that dialog instead, with its position
// computed relative to the dialog's box rather than the viewport (an
// element with `transform` — which a centered dialog typically has —
// becomes the containing block for its `position: fixed` descendants).
// Exported for labelDialog.js — same "append inside the host app's own open
// dialog, if any" rule applies to any overlay the module opens, not just
// these anchored floating panels.
export function resolveHost(anchorEl) {
  return anchorEl?.closest?.("dialog[open]") ?? document.body;
}

export function openFloating(x, y, className, build, anchorEl) {
  closeFloating();

  const host = resolveHost(anchorEl);
  const hostRect = host === document.body ? null : host.getBoundingClientRect();
  let left = hostRect ? x - hostRect.left : x;
  let top = hostRect ? y - hostRect.top : y;

  const panel = document.createElement("div");
  panel.className = `cll-floating ${className}`;
  panel.style.position = "fixed";
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
  host.appendChild(panel);
  openEl = panel;

  const close = () => closeFloating();
  build(panel, close);

  const rect = panel.getBoundingClientRect();
  if (rect.right > window.innerWidth) {
    left = Math.max(0, left - rect.width);
    panel.style.left = `${left}px`;
  }
  if (rect.bottom > window.innerHeight) {
    top = Math.max(0, top - rect.height);
    panel.style.top = `${top}px`;
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
