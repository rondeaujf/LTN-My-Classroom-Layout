import { renderGrid } from "./render.js";

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
 * Opens the browser's print dialog ("Save as PDF" is one of its
 * destinations) on a dedicated A4 layout, isolated from the rest of the
 * page via @media print (see style.css, .cll-print-sheet). The banner
 * (school/teacher row + meta line, dark rule underneath) intentionally
 * mirrors the "student list" PDF export banner already used elsewhere in
 * the host app, for a consistent look across exports.
 */
export function printLayout(state, { teacher, editableTeacherInputs } = {}) {
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
  renderGrid(gridHost, state, {});

  document.body.appendChild(sheet);
  document.body.classList.add("cll-printing");

  const cleanup = () => {
    sheet.remove();
    document.body.classList.remove("cll-printing");
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);

  window.print();
}
