// Manual "add a label" dialog — a free first/last name + level, for a
// student not in options.students (or no roster supplied at all). Styled to
// match the host site's own dialog chrome (dark header, white bold title,
// filled/outline footer buttons — see .cll-dialog* below and
// --cll-toolbar-blue, src/style.css) rather than the module's small
// anchored floating panels (openFloating, popup.js): a real form with
// several fields reads better as a centered dialog.
import { resolveHost } from "./popup.js";

function field(labelText, { type = "text", autofocus = false } = {}) {
  const wrap = document.createElement("label");
  wrap.className = "cll-dialog__field";
  const span = document.createElement("span");
  span.textContent = labelText;
  const input = document.createElement("input");
  input.type = type;
  if (autofocus) input.autofocus = true;
  wrap.append(span, input);
  return { wrap, input };
}

export function openLabelDialog({ onSubmit, anchorEl } = {}) {
  const host = resolveHost(anchorEl);

  const backdrop = document.createElement("div");
  backdrop.className = "cll-dialog-backdrop";

  const dialog = document.createElement("form");
  dialog.className = "cll-dialog";

  const header = document.createElement("div");
  header.className = "cll-dialog__header";
  const title = document.createElement("span");
  title.className = "cll-dialog__title";
  title.textContent = "Ajouter un label";
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "cll-dialog__close";
  closeBtn.textContent = "×";
  header.append(title, closeBtn);

  const body = document.createElement("div");
  body.className = "cll-dialog__body";
  const firstName = field("Prénom", { autofocus: true });
  const lastName = field("Nom");
  const level = field("Étiquette");
  body.append(firstName.wrap, lastName.wrap, level.wrap);

  const footer = document.createElement("div");
  footer.className = "cll-dialog__footer";
  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "cll-dialog__btn";
  cancelBtn.textContent = "Annuler";
  const submitBtn = document.createElement("button");
  submitBtn.type = "submit";
  submitBtn.className = "cll-dialog__btn cll-dialog__btn--primary";
  submitBtn.textContent = "Ajouter";
  footer.append(cancelBtn, submitBtn);

  dialog.append(header, body, footer);
  backdrop.appendChild(dialog);
  host.appendChild(backdrop);

  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey);
  };
  const onKey = (e) => {
    if (e.key === "Escape") close();
  };
  document.addEventListener("keydown", onKey);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  closeBtn.addEventListener("click", close);
  cancelBtn.addEventListener("click", close);
  dialog.addEventListener("submit", (e) => {
    e.preventDefault();
    const first = firstName.input.value.trim();
    const last = lastName.input.value.trim();
    const lvl = level.input.value.trim();
    if (!first && !last) return;
    close();
    onSubmit({
      firstName: first || undefined,
      lastName: last || undefined,
      level: lvl || undefined,
    });
  });

  firstName.input.focus();

  return { close };
}
