import {
  createEmptyState,
  fitGridToContentWithRing,
  deserializeState,
  setSubtitle,
} from "./model.js";
import { renderGrid } from "./render.js";
import { attachInteractions } from "./interactions.js";
import { printLayout } from "./print.js";

export { buildPrintSheet } from "./print.js";

export class ClassroomLayout {
  #container;
  #root;
  #subtitleInput;
  #gridHost;
  #state;
  #options;
  #detachInteractions;
  #saveTimer;

  /**
   * @param {string|Element} container
   * @param {object} [options]
   * @param {{cols:number, rows:number}} [options.gridDefault] initial grid (default 5x6) for a configuration that was never saved
   * @param {Array<{id?, firstName?, lastName?, name?, level?, group?}>} [options.students]
   * @param {Array<{label?, value}>|string[]} [options.colors] preferred colors (site/subject colors)
   * @param {{firstName?, lastName?, className?, school?, year?}} [options.teacher]
   * @param {{load(): any, save(state): void}} [options.persistence] persistence adapter supplied by the host app
   * @param {(state) => void} [options.onChange]
   * @param {(state, {teacher}) => void} [options.onPrint] overrides the built-in browser print dialog — e.g. to render a PDF from buildPrintSheet(state, {teacher, logoUrl}) and show it however the host app displays PDFs
   * @param {string} [options.logoUrl] optional host-app logo, shown at the bottom of the print/PDF sheet (mirrors the site's other PDF exports)
   */
  constructor(container, options = {}) {
    this.#container =
      typeof container === "string"
        ? document.querySelector(container)
        : container;
    if (!this.#container) {
      throw new Error("ClassroomLayout: conteneur introuvable");
    }
    this.#options = options;
    this.#state = createEmptyState(options.gridDefault);
    this.#buildDom();
    this.ready = this.#load();
  }

  #buildDom() {
    this.#container.replaceChildren();
    this.#root = document.createElement("div");
    this.#root.className = "cll-root";

    const toolbar = document.createElement("div");
    toolbar.className = "cll-toolbar";

    this.#subtitleInput = document.createElement("input");
    this.#subtitleInput.type = "text";
    this.#subtitleInput.placeholder =
      "Sous-titre (facultatif, affiché à l'impression)";
    this.#subtitleInput.addEventListener("change", () => {
      this.applyChange((s) => setSubtitle(s, this.#subtitleInput.value));
    });

    const printBtn = document.createElement("button");
    printBtn.type = "button";
    printBtn.textContent = "Imprimer / Export PDF";
    printBtn.addEventListener("click", () => this.print());

    toolbar.append(this.#subtitleInput, printBtn);

    this.#gridHost = document.createElement("div");

    this.#root.append(toolbar, this.#gridHost);
    this.#container.appendChild(this.#root);
  }

  async #load() {
    const loader = this.#options.persistence?.load;
    if (loader) {
      const saved = await loader();
      if (saved) {
        const loaded =
          typeof saved === "string" ? deserializeState(saved) : saved;
        this.#state = fitGridToContentWithRing(
          loaded,
          this.#options.gridDefault,
        );
      }
    }
    this.#subtitleInput.value = this.#state.subtitle;
    this.#render();
  }

  #render() {
    const gridEl = renderGrid(this.#gridHost, this.#state, {
      nameFit: this.#options.nameFit,
    });
    this.#detachInteractions?.();
    this.#detachInteractions = attachInteractions(gridEl, {
      getState: () => this.#state,
      applyChange: (fn) => this.applyChange(fn),
      options: this.#options,
      hostEl: this.#root,
    });
  }

  applyChange(fn) {
    this.#state = fn(this.#state);
    this.#subtitleInput.value = this.#state.subtitle;
    this.#render();
    this.#scheduleSave();
    this.#options.onChange?.(this.getState());
  }

  #scheduleSave() {
    if (!this.#options.persistence?.save) return;
    clearTimeout(this.#saveTimer);
    // Lightly debounced to avoid saving on every keystroke/move; flushed
    // immediately by destroy() so nothing is lost on close.
    this.#saveTimer = setTimeout(() => this.#flushSave(), 300);
  }

  #flushSave() {
    clearTimeout(this.#saveTimer);
    this.#saveTimer = null;
    this.#options.persistence?.save?.(this.getState());
  }

  getState() {
    return this.#state;
  }

  setState(state) {
    this.#state = typeof state === "string" ? deserializeState(state) : state;
    this.#subtitleInput.value = this.#state.subtitle;
    this.#render();
  }

  print() {
    const teacher = this.#options.teacher ?? this.#state.teacherOverride;
    const logoUrl = this.#options.logoUrl;
    if (this.#options.onPrint) {
      this.#options.onPrint(this.getState(), { teacher, logoUrl });
      return;
    }
    printLayout(this.#state, {
      teacher,
      logoUrl,
      editableTeacherInputs: !this.#options.teacher,
    });
  }

  destroy() {
    this.#flushSave();
    this.#detachInteractions?.();
    this.#container.replaceChildren();
  }
}

export * from "./model.js";
