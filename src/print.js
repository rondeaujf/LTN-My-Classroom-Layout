import { renderGrid, finalizeLayout } from "./render.js";
import { fitGridToContentWithRing } from "./model.js";

function teacherName(teacher) {
  if (!teacher) return "";
  return [teacher.firstName, teacher.lastName].filter(Boolean).join(" ");
}

function metaLine(state, teacher) {
  const parts = [teacher?.className, teacher?.year].filter(Boolean);
  const left = parts.join(" · ");
  if (left && state.subtitle) return `${left} — ${state.subtitle}`;
  return left || state.subtitle || "";
}

/**
 * Builds the same dedicated A4 sheet used by printLayout() — banner
 * (school/teacher row + meta line, dark rule underneath, mirroring the
 * "student list" PDF export banner already used elsewhere in the host app)
 * plus the grid — as a detached DOM node, not yet attached to the document.
 * Exposed so a host app can render its own PDF from it (e.g. via
 * html2canvas) instead of going through the browser's print dialog; see
 * options.onPrint in src/index.js.
 */
export function buildPrintSheet(
  rawState,
  { teacher, editableTeacherInputs, logoUrl, showLevel, nameDisplay } = {},
) {
  // The editing grid can be much bigger than its actual content — every
  // border/desk placed flush against its own current edge grows a fresh
  // free ring to keep the room extensible (growGridToKeepFreeRing,
  // src/model.js), which adds up over a session — printing/exporting that
  // whole grid wastes most of the page on empty margin and shrinks the
  // room itself far more than it needs to. Cropped with NO ring here
  // (unlike the load-time fit, which keeps one so live editing can still
  // extend the room) — a wall already sits flush against the content's own
  // bounding box (fitGridToContentWithRing's edges loop includes it), so
  // no extra margin is needed just to print/export it.
  const state = fitGridToContentWithRing(rawState, rawState.grid, 0);
  const sheet = document.createElement("div");
  sheet.className = "cll-print-sheet";

  const header = document.createElement("div");
  header.className = "cll-print-header";

  const school = teacher?.school ?? "";
  const name = teacherName(teacher);
  if (school || name || editableTeacherInputs) {
    const row = document.createElement("div");
    row.className = "cll-print-banner-row";
    row.appendChild(
      Object.assign(document.createElement("span"), {
        className: "cll-print-school",
        textContent:
          school || (editableTeacherInputs ? "École : _______________" : ""),
      }),
    );
    row.appendChild(
      Object.assign(document.createElement("span"), {
        className: "cll-print-teacher",
        textContent:
          name || (editableTeacherInputs ? "Enseignant : _______________" : ""),
      }),
    );
    header.appendChild(row);
  }

  const meta = metaLine(state, teacher);
  if (meta) {
    header.appendChild(
      Object.assign(document.createElement("div"), {
        className: "cll-print-meta",
        textContent: meta,
      }),
    );
  }
  sheet.appendChild(header);

  const gridHost = document.createElement("div");
  gridHost.className = "cll-root cll-print-grid-host";
  sheet.appendChild(gridHost);
  renderGrid(gridHost, state, { showLevel, nameDisplay });

  // Optional host-app logo (options.logoUrl), bottom of the sheet — same
  // spot as the "student list" PDF export footer already used elsewhere in
  // the host app, for a consistent look across exports.
  if (logoUrl) {
    const footer = document.createElement("div");
    footer.className = "cll-print-footer";
    const logo = document.createElement("img");
    logo.className = "cll-print-logo";
    logo.src = logoUrl;
    logo.alt = "";
    footer.appendChild(logo);
    sheet.appendChild(footer);
  }

  return sheet;
}

/**
 * Opens the browser's print dialog ("Save as PDF" is one of its
 * destinations) on the sheet built by buildPrintSheet(), isolated from the
 * rest of the page via @media print (see style.css, .cll-print-sheet).
 */
export function printLayout(state, options = {}) {
  const sheet = buildPrintSheet(state, options);

  document.body.appendChild(sheet);
  document.body.classList.add("cll-printing");
  // .cll-print-sheet is display:none outside of an actual browser print
  // (see style.css) — a real layout box (offsetWidth etc., what
  // finalizeLayout needs) only exists once @media print actually applies,
  // which happens inside window.print()'s own rendering, too late for any
  // JS on this side of that (blocking) call to react to. Given one,
  // off-screen and synchronously undone before the next paint — and before
  // window.print() below, which blocks and never lets a deferred fix run
  // first either way.
  sheet.style.position = "fixed";
  sheet.style.left = "-99999px";
  sheet.style.display = "block";
  finalizeLayout(sheet, { nameFit: options.nameFit });
  sheet.style.position = "";
  sheet.style.left = "";
  sheet.style.display = "";

  const cleanup = () => {
    sheet.remove();
    document.body.classList.remove("cll-printing");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  window.print();
}
