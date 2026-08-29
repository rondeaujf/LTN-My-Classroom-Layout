import { renderGrid } from "./render.js";

function teacherLine(teacher) {
  if (!teacher) return "";
  return [
    [teacher.firstName, teacher.lastName].filter(Boolean).join(" "),
    teacher.className,
    teacher.school,
    teacher.year,
  ]
    .filter(Boolean)
    .join(" — ");
}

/**
 * Ouvre la boîte de dialogue d'impression du navigateur ("Enregistrer en
 * PDF" y figure comme destination) sur une mise en page dédiée A4, isolée
 * du reste de la page via @media print (cf. style.css, .cll-print-sheet).
 */
export function printLayout(state, { teacher, editableTeacherInputs } = {}) {
  const sheet = document.createElement("div");
  sheet.className = "cll-print-sheet";

  const header = document.createElement("div");
  header.className = "cll-print-header";
  const line = teacherLine(teacher);
  if (line) {
    header.appendChild(
      Object.assign(document.createElement("div"), {
        className: "cll-print-teacher",
        textContent: line,
      }),
    );
  } else if (editableTeacherInputs) {
    header.appendChild(
      Object.assign(document.createElement("div"), {
        className: "cll-print-teacher-blank",
        textContent: "Enseignant, classe, école, année : _______________",
      }),
    );
  }
  if (state.subtitle) {
    header.appendChild(
      Object.assign(document.createElement("div"), {
        className: "cll-print-subtitle",
        textContent: state.subtitle,
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
