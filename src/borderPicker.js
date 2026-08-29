import { openFloating } from "./popup.js";
import { buildBorderIcon } from "./svg.js";
import { BORDER_TYPES } from "./model.js";

const LABELS = { tableau: "Tableau", porte: "Porte", fenetre: "Fenêtre" };

export function openBorderPicker(x, y, { onPick }) {
  return openFloating(x, y, "cll-borderpicker", (panel, close) => {
    BORDER_TYPES.forEach((type) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "cll-borderpicker-btn";
      btn.appendChild(buildBorderIcon(type));
      const span = document.createElement("span");
      span.textContent = LABELS[type];
      btn.appendChild(span);
      btn.addEventListener("click", () => {
        close();
        onPick(type);
      });
      panel.appendChild(btn);
    });
  });
}
