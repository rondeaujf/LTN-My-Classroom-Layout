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

/**
 * Pure positioning math for openFloating's post-render overflow check —
 * exported for unit testing (see tests/popup.test.js): jsdom has no real
 * layout engine, so the actual DOM integration can only ever exercise this
 * with all-zero rects, never a real overflow case. Flips past the near
 * edge to clear a far edge it overflows (right/bottom), then clamps to 0 —
 * flipping to clear one edge can itself push the panel past the opposite
 * one, for a panel wider/taller than the available box.
 */
export function clampFloatingPosition({
  left,
  top,
  rectRight,
  rectBottom,
  panelWidth,
  panelHeight,
  boundRight,
  boundBottom,
}) {
  let clampedLeft = left;
  let clampedTop = top;
  if (rectRight > boundRight) clampedLeft -= panelWidth;
  if (rectBottom > boundBottom) clampedTop -= panelHeight;
  return { left: Math.max(clampedLeft, 0), top: Math.max(clampedTop, 0) };
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

  // Clamped within whichever box actually bounds it on screen — the host
  // dialog's own box when hosted inside one, not just the viewport: a
  // dialog with overflow:auto (the host app's own .ltn-modal, e.g.) clips a
  // position:fixed descendant that overflows ITS box even while still
  // comfortably inside the viewport, silently making the panel disappear
  // rather than just look misplaced.
  const rect = panel.getBoundingClientRect();
  ({ left, top } = clampFloatingPosition({
    left,
    top,
    rectRight: rect.right,
    rectBottom: rect.bottom,
    panelWidth: rect.width,
    panelHeight: rect.height,
    boundRight: hostRect ? hostRect.right : window.innerWidth,
    boundBottom: hostRect ? hostRect.bottom : window.innerHeight,
  }));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;

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
