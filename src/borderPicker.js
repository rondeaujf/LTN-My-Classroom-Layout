import { openFloating } from "./popup.js";
import { buildBorderIcon } from "./svg.js";
import { BORDER_TYPES } from "./model.js";
import { makeT } from "./i18n.js";

const LABEL_KEYS = {
  tableau: "borderTableau",
  porte: "borderPorte",
  fenetre: "borderFenetre",
  mur: "borderMur",
};

export function openBorderPicker(x, y, { onPick, anchorEl, t = makeT() }) {
  return openFloating(
    x,
    y,
    "cll-borderpicker",
    (panel, close) => {
      BORDER_TYPES.forEach((type) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "cll-borderpicker-btn";
        btn.appendChild(buildBorderIcon(type));
        const span = document.createElement("span");
        span.textContent = t(LABEL_KEYS[type]);
        btn.appendChild(span);
        btn.addEventListener("click", () => {
          close();
          onPick(type);
        });
        panel.appendChild(btn);
      });
    },
    anchorEl,
  );
}
