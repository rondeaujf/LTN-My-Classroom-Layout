import { openFloating } from "./popup.js";
import { buildMenuIcon } from "./svg.js";

export function openContextMenu(x, y, items, anchorEl) {
  return openFloating(
    x,
    y,
    "cll-menu",
    (panel, close) => {
      const ul = document.createElement("ul");
      ul.className = "cll-menu-list";
      items.forEach((item) => {
        if (item.separator) {
          const sep = document.createElement("li");
          sep.className = "cll-menu-sep";
          ul.appendChild(sep);
          return;
        }
        const li = document.createElement("li");
        li.className = "cll-menu-item" + (item.disabled ? " is-disabled" : "");
        const icon = item.icon && buildMenuIcon(item.icon);
        if (icon) li.appendChild(icon);
        li.appendChild(
          Object.assign(document.createElement("span"), {
            className: "cll-menu-item-label",
            textContent: item.label,
          }),
        );
        if (!item.disabled) {
          li.addEventListener("click", () => {
            close();
            item.onSelect();
          });
        }
        ul.appendChild(li);
      });
      panel.appendChild(ul);
    },
    anchorEl,
  );
}
