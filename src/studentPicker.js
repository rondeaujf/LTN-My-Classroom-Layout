import { openFloating } from "./popup.js";
import { buildMenuIcon } from "./svg.js";

function studentLabel(s) {
  if (s.name) return s.name;
  return [s.firstName, s.lastName].filter(Boolean).join(" ");
}

export function openStudentPicker(
  x,
  y,
  {
    students = [],
    assignedIds = new Set(),
    currentStudent,
    onAssign,
    onUnassign,
    anchorEl,
  },
) {
  return openFloating(
    x,
    y,
    "cll-studentpicker",
    (panel, close) => {
      if (currentStudent) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "cll-student-remove";
        removeBtn.appendChild(buildMenuIcon("trash"));
        removeBtn.appendChild(document.createTextNode("Retirer l'élève"));
        removeBtn.addEventListener("click", () => {
          close();
          onUnassign();
        });
        panel.appendChild(removeBtn);
      }

      // The teacher entry (isTeacher, cf. teacherStudentEntry in
      // interactions.js) is exempt from the "one desk per roster id" rule: it
      // stays pickable even after already being assigned elsewhere.
      const available = students.filter(
        (s) =>
          s.isTeacher ||
          !s.id ||
          !assignedIds.has(s.id) ||
          (currentStudent && currentStudent.id === s.id),
      );

      if (available.length) {
        const search = document.createElement("input");
        search.type = "search";
        search.className = "cll-student-search";
        search.placeholder = "Rechercher un élève…";

        const list = document.createElement("ul");
        list.className = "cll-student-list";

        const renderList = (filter = "") => {
          list.replaceChildren();
          available
            .filter((s) =>
              studentLabel(s).toLowerCase().includes(filter.toLowerCase()),
            )
            .forEach((s) => {
              const li = document.createElement("li");
              const suffix = s.isTeacher ? "Enseignant" : s.level;
              li.textContent = suffix
                ? `${studentLabel(s)} — ${suffix}`
                : studentLabel(s);
              li.addEventListener("click", () => {
                close();
                onAssign({ id: s.id, name: studentLabel(s), level: s.level });
              });
              list.appendChild(li);
            });
        };
        renderList();
        search.addEventListener("input", () => renderList(search.value));

        panel.append(search, list);
      }

      const form = document.createElement("form");
      form.className = "cll-student-free-form";
      const freeInput = document.createElement("input");
      freeInput.type = "text";
      freeInput.placeholder = "Ou saisir un nom libre…";
      const submitBtn = document.createElement("button");
      submitBtn.type = "submit";
      submitBtn.textContent = "OK";
      form.append(freeInput, submitBtn);
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = freeInput.value.trim();
        if (!name) return;
        close();
        onAssign({ name });
      });
      panel.appendChild(form);
    },
    anchorEl,
  );
}
