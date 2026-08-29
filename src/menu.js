import { openFloating } from "./popup.js";

export function openContextMenu(x, y, items) {
  return openFloating(x, y, "cll-menu", (panel, close) => {
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
      li.textContent = item.label;
      if (!item.disabled) {
        li.addEventListener("click", () => {
          close();
          item.onSelect();
        });
      }
      ul.appendChild(li);
    });
    panel.appendChild(ul);
  });
}
