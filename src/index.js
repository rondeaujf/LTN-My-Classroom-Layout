import {
  createEmptyState,
  fitGridToContentWithRing,
  deserializeState,
  setSubtitle,
} from "./model.js";
import { renderGrid, fitGridToHost } from "./render.js";
import { attachInteractions } from "./interactions.js";
import { printLayout } from "./print.js";

export { buildPrintSheet } from "./print.js";
export { finalizeLayout } from "./render.js";

export class ClassroomLayout {
  #container;
  #root;
  #subtitleInput;
  #gridHost;
  #state;
  #options;
  #detachInteractions;
  #saveTimer;
  #resizeObserver;

  /**
   * @param {string|Element} container
   * @param {object} [options]
   * @param {{cols:number, rows:number}} [options.gridDefault] initial grid (default 5x6) for a configuration that was never saved
   * @param {Array<{id?, firstName?, lastName?, name?, level?, group?}>} [options.students]
   * @param {Array<{label?, value}>|string[]} [options.colors] preferred colors (site/subject colors)
   * @param {{firstName?, lastName?, className?, school?, year?}} [options.teacher]
   * @param {{load(): any, save(state): void}} [options.persistence] persistence adapter supplied by the host app
   * @param {(state) => void} [options.onChange]
   * @param {(state, {teacher, logoUrl, showLevel, nameDisplay, nameFit, levelFit, printOrientation, printPaper}) => void} [options.onPrint] overrides the built-in browser print dialog — e.g. to render a PDF from buildPrintSheet(state, {teacher, logoUrl, showLevel, nameDisplay, nameFit, levelFit}) and show it however the host app displays PDFs. The print settings (nameFit/levelFit/printOrientation/printPaper) are passed straight through so the host can honor them in its own PDF renderer.
   * @param {string} [options.logoUrl] optional host-app logo, shown at the bottom of the print/PDF sheet (mirrors the site's other PDF exports)
   * @param {boolean} [options.showLevel] whether to show the student's level badge on the desk (default true)
   * @param {"full"|"firstName"|"lastName"} [options.nameDisplay] which part of the student's name to show on the desk (default "full")
   * @param {{max?:number, min?:number}} [options.nameFit] px bounds for the desk name's automatic size-down (default {max:12, min:7})
   * @param {{max?:number, min?:number}} [options.levelFit] px bounds for the level badge's font (default {max:8, min:7}) — max is the standard size, the badge only ever shrinks from it (down to min) to clear the name
   * @param {"portrait"|"landscape"} [options.printOrientation] page orientation for print / PDF export (default "portrait")
   * @param {string} [options.printPaper] paper size for print / PDF export, e.g. "A4" (default), "A3", "letter"
   * @param {boolean} [options.editableBorders] whether wall/board/door/window border objects can be added, changed or removed (default true) — false locks them, desks stay editable
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
    this.#gridHost.className = "cll-grid-host";

    this.#root.append(toolbar, this.#gridHost);
    this.#container.appendChild(this.#root);

    // Re-fits the grid (fitGridToHost, src/render.js) whenever the host's
    // own box changes shape — a state change already re-fits as part of
    // #render(), but the host can just as well be reshaped on its own
    // (e.g. the user resizing a host app's dialog) without the state
    // changing at all.
    this.#resizeObserver = new ResizeObserver(() => {
      const grid = this.#gridHost.querySelector(".cll-grid");
      if (grid) fitGridToHost(this.#gridHost, grid);
    });
    this.#resizeObserver.observe(this.#gridHost);
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
    // false = bords (mur/tableau/porte/fenêtre) verrouillés : la classe coupe
    // l'affordance CSS (cf. style.css) et attachInteractions ignore les clics
    // sur .cll-edge.
    this.#root.classList.toggle(
      "cll-root--borders-locked",
      this.#options.editableBorders === false,
    );
    const gridEl = renderGrid(this.#gridHost, this.#state, {
      nameFit: this.#options.nameFit,
      levelFit: this.#options.levelFit,
      showLevel: this.#options.showLevel,
      nameDisplay: this.#options.nameDisplay,
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
    // Réglages d'impression transmis tels quels : la même charge utile part
    // vers onPrint (l'hôte les applique dans son propre moteur PDF) et vers le
    // printLayout intégré (dialogue navigateur).
    const printOpts = {
      teacher,
      logoUrl: this.#options.logoUrl,
      showLevel: this.#options.showLevel,
      nameDisplay: this.#options.nameDisplay,
      nameFit: this.#options.nameFit,
      levelFit: this.#options.levelFit,
      printOrientation: this.#options.printOrientation,
      printPaper: this.#options.printPaper,
    };
    if (this.#options.onPrint) {
      this.#options.onPrint(this.getState(), printOpts);
      return;
    }
    printLayout(this.#state, {
      ...printOpts,
      editableTeacherInputs: !this.#options.teacher,
    });
  }

  destroy() {
    this.#flushSave();
    this.#detachInteractions?.();
    this.#resizeObserver?.disconnect();
    this.#container.replaceChildren();
  }
}

export * from "./model.js";
