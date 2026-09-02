import { openFloating } from "./popup.js";
import { toHex6, toAlphaPercent, composeColor } from "./colorUtils.js";
import { makeT } from "./i18n.js";

export function openColorPicker(
  x,
  y,
  { preferred = [], current, onPick, anchorEl, t = makeT() },
) {
  return openFloating(
    x,
    y,
    "cll-colorpicker",
    (panel, close) => {
      if (preferred.length) {
        const swatches = document.createElement("div");
        swatches.className = "cll-swatches";
        preferred.forEach((c) => {
          const value = typeof c === "string" ? c : c.value;
          const label = typeof c === "string" ? c : (c.label ?? c.value);
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "cll-swatch";
          btn.style.background = value;
          btn.title = label;
          btn.addEventListener("click", () => {
            close();
            onPick(value);
          });
          swatches.appendChild(btn);
        });
        panel.appendChild(swatches);
      }

      const custom = document.createElement("div");
      custom.className = "cll-color-custom";

      const hexInput = document.createElement("input");
      hexInput.type = "color";
      hexInput.value = toHex6(current);

      const alphaInput = document.createElement("input");
      alphaInput.type = "range";
      alphaInput.min = "10";
      alphaInput.max = "100";
      alphaInput.value = String(toAlphaPercent(current));
      alphaInput.className = "cll-color-alpha";
      alphaInput.title = t("colorOpacity");

      const applyBtn = document.createElement("button");
      applyBtn.type = "button";
      applyBtn.className = "cll-color-apply";
      applyBtn.textContent = t("colorApply");
      applyBtn.addEventListener("click", () => {
        close();
        onPick(composeColor(hexInput.value, alphaInput.value));
      });

      custom.append(hexInput, alphaInput, applyBtn);
      panel.appendChild(custom);

      const resetBtn = document.createElement("button");
      resetBtn.type = "button";
      resetBtn.className = "cll-color-reset";
      resetBtn.textContent = t("colorNone");
      resetBtn.addEventListener("click", () => {
        close();
        onPick(null);
      });
      panel.appendChild(resetBtn);
    },
    anchorEl,
  );
}
