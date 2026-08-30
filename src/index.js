import {
  createEmptyState,
  fitGridToContentWithRing,
  deserializeState,
  setSubtitle,
  unassignAllStudents,
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
  // Réglages modifiables à chaud via le panneau « Paramètres » de la barre
  // d'outils. Initialisés depuis `options` à la construction, NON persistés :
  // rouvrir le module repart des valeurs de l'hôte.
  #settings;
  // levelFit.max suit nameFit.max au ratio initial (défaut 8/12 ≈ 0.67) quand
  // l'utilisateur règle la taille de police du nom dans le panneau.
  #levelNameRatio;
  // Facteur de zoom molette (survol de la grille). Session uniquement.
  #zoom = 1;
  #gridWheelHandler;
  // Quelles parties de la barre d'outils intégrée sont affichées
  // (cf. options.toolbar). `false` partout = aucune barre, l'hôte pilote via
  // l'API (setSettings/setSubtitle/print/…).
  #toolbar;
  // Références vers les contrôles du panneau « Paramètres » pour les
  // resynchroniser quand setSettings() est appelé par programmation.
  #settingsControls = {};

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
   * @param {{max?:number, min?:number}} [options.nameFit] px bounds for the desk name's automatic size-down (default {max:12, min:5})
   * @param {{max?:number, min?:number}} [options.levelFit] px bounds for the level badge's font (default {max:8, min:5}) — max is the standard size, the badge only ever shrinks from it (down to min) to clear the name
   * @param {"portrait"|"landscape"} [options.printOrientation] page orientation for print / PDF export (default "portrait")
   * @param {string} [options.printPaper] paper size for print / PDF export, e.g. "A4" (default), "A3", "letter"
   * @param {boolean} [options.editableBorders] whether wall/board/door/window border objects can be added, changed or removed (default true) — false locks them, desks stay editable
   * @param {boolean|{subtitle?:boolean, settings?:boolean, print?:boolean}} [options.toolbar] which parts of the built-in toolbar to render: `true` (default) shows all; `false` shows none (drive it via the API — setSubtitle/settings/setSettings/setZoom/print/exportJsonPayload/importJson/unassignAllStudents/clearLayout); an object hides only the parts set to `false`.
   *
   * The values above marked as such (printOrientation, nameDisplay, showLevel,
   * editableBorders, nameFit.max) are the *initial* values of the toolbar's
   * "Paramètres" panel, where the user can change them for the session (not
   * persisted). The mouse wheel over the grid zooms it in/out.
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

    const nameMax = options.nameFit?.max ?? 12;
    const levelMax = options.levelFit?.max ?? 8;
    this.#levelNameRatio = nameMax > 0 ? levelMax / nameMax : 0.64;
    this.#settings = {
      printOrientation: options.printOrientation ?? "portrait",
      nameDisplay: options.nameDisplay ?? "full",
      showLevel: options.showLevel !== false,
      editableBorders: options.editableBorders !== false,
      nameFit: { max: nameMax, min: options.nameFit?.min ?? 5 },
      levelFit: { max: levelMax, min: options.levelFit?.min ?? 5 },
    };

    const tb = options.toolbar;
    const part = (key) =>
      tb === false
        ? false
        : tb == null || tb === true
          ? true
          : tb[key] !== false;
    this.#toolbar = {
      subtitle: part("subtitle"),
      settings: part("settings"),
      print: part("print"),
    };

    this.#state = createEmptyState(options.gridDefault);
    this.#buildDom();
    this.ready = this.#load();
  }

  /** Applique un patch de réglages (panneau « Paramètres ») et re-rend. Pas de persistance. */
  #applySetting(patch) {
    Object.assign(this.#settings, patch);
    this.#syncSettingsPanel();
    this.#render();
  }

  /** Reflète #settings dans les contrôles du panneau (après un setSettings()). */
  #syncSettingsPanel() {
    const c = this.#settingsControls;
    if (c.orientation) c.orientation.value = this.#settings.printOrientation;
    if (c.nameDisplay) c.nameDisplay.value = this.#settings.nameDisplay;
    if (c.showLevel) c.showLevel.checked = this.#settings.showLevel;
    if (c.editableBorders)
      c.editableBorders.checked = this.#settings.editableBorders;
    if (c.fontMax) c.fontMax.value = String(this.#settings.nameFit.max);
  }

  /** Re-dimensionne la grille au zoom courant (molette). No-op si pas encore rendue. */
  #refitGrid() {
    const grid = this.#gridHost?.querySelector(".cll-grid");
    if (grid) fitGridToHost(this.#gridHost, grid, this.#zoom);
  }

  #buildDom() {
    this.#container.replaceChildren();
    this.#root = document.createElement("div");
    this.#root.className = "cll-root";

    const parts = [];
    if (this.#toolbar.subtitle) {
      this.#subtitleInput = document.createElement("input");
      this.#subtitleInput.type = "text";
      this.#subtitleInput.placeholder =
        "Sous-titre (facultatif, affiché à l'impression)";
      this.#subtitleInput.addEventListener("change", () => {
        this.applyChange((s) => setSubtitle(s, this.#subtitleInput.value));
      });
      parts.push(this.#subtitleInput);
    }
    if (this.#toolbar.settings) parts.push(this.#buildSettings());
    if (this.#toolbar.print) {
      const printBtn = document.createElement("button");
      printBtn.type = "button";
      printBtn.textContent = "Imprimer / Export PDF";
      printBtn.addEventListener("click", () => this.print());
      parts.push(printBtn);
    }
    if (parts.length) {
      const toolbar = document.createElement("div");
      toolbar.className = "cll-toolbar";
      toolbar.append(...parts);
      this.#root.append(toolbar);
    }

    this.#gridHost = document.createElement("div");
    this.#gridHost.className = "cll-grid-host";
    // Molette au survol de la grille = zoom. `{ passive: false }` pour pouvoir
    // preventDefault() : sinon la molette ferait défiler la page / le dialog
    // hôte au lieu de zoomer.
    this.#gridWheelHandler = (e) => this.#onGridWheel(e);
    this.#gridHost.addEventListener("wheel", this.#gridWheelHandler, {
      passive: false,
    });

    this.#root.append(this.#gridHost);
    this.#container.appendChild(this.#root);

    // Re-fits the grid (fitGridToHost, src/render.js) whenever the host's
    // own box changes shape — a state change already re-fits as part of
    // #render(), but the host can just as well be reshaped on its own
    // (e.g. the user resizing a host app's dialog) without the state
    // changing at all. Keeps the current wheel zoom.
    this.#resizeObserver = new ResizeObserver(() => this.#refitGrid());
    this.#resizeObserver.observe(this.#gridHost);
  }

  /**
   * Barre d'outils : bloc « Paramètres » repliable (sous le sous-titre).
   * Réglages appliqués à chaud, non persistés (cf. #settings).
   */
  #buildSettings() {
    const wrap = document.createElement("div");
    wrap.className = "cll-settings";

    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "cll-settings-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.innerHTML =
      'Paramètres <span class="cll-settings-caret" aria-hidden="true">▾</span>';

    const panel = document.createElement("div");
    panel.className = "cll-settings-panel";

    toggle.addEventListener("click", () => {
      const open = panel.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });

    const field = (labelText, control) => {
      const label = document.createElement("label");
      label.className = "cll-settings-field";
      label.append(
        Object.assign(document.createElement("span"), {
          textContent: labelText,
        }),
        control,
      );
      return label;
    };

    const select = (key, options, value, onChange) => {
      const el = document.createElement("select");
      for (const [v, text] of options) {
        el.append(new Option(text, v, false, v === value));
      }
      el.addEventListener("change", () => onChange(el.value));
      this.#settingsControls[key] = el;
      return el;
    };

    const checkbox = (key, checked, onChange) => {
      const el = document.createElement("input");
      el.type = "checkbox";
      el.checked = checked;
      el.addEventListener("change", () => onChange(el.checked));
      this.#settingsControls[key] = el;
      return el;
    };

    // Orientation
    panel.append(
      field(
        "Orientation",
        select(
          "orientation",
          [
            ["portrait", "Portrait"],
            ["landscape", "Paysage"],
          ],
          this.#settings.printOrientation,
          (v) => this.#applySetting({ printOrientation: v }),
        ),
      ),
    );

    // Type de nom
    panel.append(
      field(
        "Type de nom",
        select(
          "nameDisplay",
          [
            ["full", "Nom complet"],
            ["firstName", "Prénom"],
            ["lastName", "Nom"],
          ],
          this.#settings.nameDisplay,
          (v) => this.#applySetting({ nameDisplay: v }),
        ),
      ),
    );

    // Badges de niveau
    panel.append(
      field(
        "Badges de niveau",
        checkbox("showLevel", this.#settings.showLevel, (v) =>
          this.#applySetting({ showLevel: v }),
        ),
      ),
    );

    // Bordures modifiables
    panel.append(
      field(
        "Bordures modifiables",
        checkbox("editableBorders", this.#settings.editableBorders, (v) =>
          this.#applySetting({ editableBorders: v }),
        ),
      ),
    );

    // Taille de police du nom — le badge suit au ratio initial.
    const fontInput = document.createElement("input");
    fontInput.type = "number";
    fontInput.min = "5";
    fontInput.max = "24";
    fontInput.step = "1";
    fontInput.value = String(this.#settings.nameFit.max);
    this.#settingsControls.fontMax = fontInput;
    fontInput.addEventListener("change", () => {
      const v = Math.max(5, Math.min(24, Math.round(Number(fontInput.value))));
      fontInput.value = String(v);
      this.#applySetting({
        nameFit: { ...this.#settings.nameFit, max: v },
        levelFit: {
          ...this.#settings.levelFit,
          max: Math.max(5, Math.round(v * this.#levelNameRatio)),
        },
      });
    });
    panel.append(field("Taille du nom (px)", fontInput));

    // Actions : import / export JSON + deux réinitialisations. Le <select>
    // « Portée » décide ce qu'importent/exportent les deux boutons JSON :
    // élèves seuls, layout seul, ou les deux.
    const actions = document.createElement("div");
    actions.className = "cll-settings-actions";

    const actionBtn = (label, onClick) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cll-settings-action-btn";
      b.textContent = label;
      b.addEventListener("click", onClick);
      return b;
    };

    const scopeSelect = document.createElement("select");
    scopeSelect.className = "cll-settings-scope";
    for (const [v, text] of [
      ["both", "Élèves + layout"],
      ["students", "Élèves"],
      ["layout", "Layout"],
    ]) {
      scopeSelect.append(new Option(text, v, v === "both", v === "both"));
    }

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "application/json,.json";
    fileInput.hidden = true;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      fileInput.value = "";
      if (!file) return;
      file
        .text()
        .then((text) => this.importJson(text, scopeSelect.value))
        .catch((err) =>
          console.error("ClassroomLayout: import JSON invalide", err),
        );
    });

    actions.append(
      scopeSelect,
      actionBtn("Exporter (JSON)", () => this.#downloadJson(scopeSelect.value)),
      actionBtn("Importer (JSON)", () => fileInput.click()),
      actionBtn("Désaffecter les élèves", () =>
        this.applyChange((s) => unassignAllStudents(s)),
      ),
      actionBtn("Effacer tout", () =>
        this.applyChange(() => createEmptyState(this.#options.gridDefault)),
      ),
      fileInput,
    );

    const actionsRow = document.createElement("div");
    actionsRow.className = "cll-settings-field cll-settings-field--actions";
    actionsRow.append(
      Object.assign(document.createElement("span"), { textContent: "Actions" }),
      actions,
    );
    panel.append(actionsRow);

    wrap.append(toggle, panel);
    return wrap;
  }

  /**
   * Instantané JSON-sérialisable. `scope` : `"both"` (défaut) -> roster
   * (`options.students`) + layout (état courant) ; `"students"` -> que le
   * roster ; `"layout"` -> que le layout.
   * @param {"both"|"students"|"layout"} [scope]
   */
  exportJsonPayload(scope = "both") {
    const payload = { version: 1 };
    if (scope !== "layout") payload.students = this.#options.students ?? [];
    if (scope !== "students") payload.layout = this.getState();
    return payload;
  }

  /**
   * Applique un payload de `exportJsonPayload()` — ou tout JSON n'ayant que
   * `students`, ou que `layout`. `scope` filtre en plus ce qu'on applique
   * depuis un fichier combiné (`"both"` par défaut). Un `layout` appliqué est
   * persisté (comme n'importe quelle modification).
   * @param {string|object} input
   * @param {"both"|"students"|"layout"} [scope]
   * @returns {boolean} true si quelque chose a été appliqué
   */
  importJson(input, scope = "both") {
    const data = typeof input === "string" ? JSON.parse(input) : input;
    if (!data || typeof data !== "object") return false;
    let applied = false;
    if (scope !== "layout" && Array.isArray(data.students)) {
      this.#options = { ...this.#options, students: data.students };
      applied = true;
    }
    if (
      scope !== "students" &&
      data.layout &&
      typeof data.layout === "object"
    ) {
      const normalized = deserializeState(JSON.stringify(data.layout));
      this.applyChange(() =>
        fitGridToContentWithRing(normalized, this.#options.gridDefault),
      );
      applied = true;
    } else if (applied) {
      this.#render(); // seul le roster a changé -> que le picker s'en serve
    }
    return applied;
  }

  #downloadJson(scope = "both") {
    const name =
      { students: "ma-classe-eleves.json", layout: "ma-classe-layout.json" }[
        scope
      ] ?? "ma-classe.json";
    const text = JSON.stringify(this.exportJsonPayload(scope), null, 2);
    const url = URL.createObjectURL(
      new Blob([text], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  // --- API : tout ce que fait la barre d'outils intégrée est aussi
  //     pilotable ici (utile avec options.toolbar: false). ------------------

  /**
   * Réglages « Paramètres » effectifs de la session (copie) :
   * `{ printOrientation, nameDisplay, showLevel, editableBorders, nameFit, levelFit }`.
   */
  get settings() {
    return {
      ...this.#settings,
      nameFit: { ...this.#settings.nameFit },
      levelFit: { ...this.#settings.levelFit },
    };
  }

  /**
   * Change un ou plusieurs réglages de session (mêmes clés que `settings`),
   * re-rend, et resynchronise le panneau s'il est affiché. NON persisté —
   * comme les contrôles du panneau. Contrairement au curseur de police du
   * panneau, `nameFit` et `levelFit` sont indépendants ici.
   */
  setSettings(patch) {
    this.#applySetting(patch);
  }

  /** Facteur de zoom molette courant (1 = grille ajustée avec sa couronne vide). */
  get zoom() {
    return this.#zoom;
  }

  /** Fixe le zoom (borné à [1, 5]) et re-dimensionne la grille. */
  setZoom(z) {
    this.#zoom = Math.min(5, Math.max(1, Number(z) || 1));
    this.#refitGrid();
  }

  /** Remet le zoom à 1 (vue ajustée avec la couronne vide). */
  resetZoom() {
    this.setZoom(1);
  }

  /** Fixe le sous-titre (persisté, comme le champ de la barre d'outils). */
  setSubtitle(text) {
    this.applyChange((s) => setSubtitle(s, String(text ?? "")));
  }

  /** Retire tous les élèves des bureaux et des tables (garde le mobilier). */
  unassignAllStudents() {
    this.applyChange((s) => unassignAllStudents(s));
  }

  /** Efface tout : retour à la grille vide par défaut (persisté). */
  clearLayout() {
    this.applyChange(() => createEmptyState(this.#options.gridDefault));
  }

  /**
   * Molette sur la grille : zoom in/out **vers la cellule sous le pointeur**
   * (cette cellule reste sous le curseur), sans laisser défiler la page/le
   * dialog.
   *
   * On ré-ancre sur l'indice de la cellule (fraction propre de la grille), pas
   * sur un point de scroll relu à chaque cran : relire scrollLeft/scrollTop
   * accumule l'erreur de clamp (bords, zoom ≈ 1) et fait dériver la vue.
   *
   * Plancher à 1 : à 1 la grille occupe déjà toute la boîte (fitGridToHost) —
   * c'est la vue « couronne extérieure vide » complète, on ne dézoome jamais
   * plus (la grille ne rétrécit pas au-delà). Plafond à 5.
   */
  #onGridWheel(e) {
    e.preventDefault();
    const grid = this.#gridHost.querySelector(".cll-grid");
    if (!grid) return;

    const oldZoom = this.#zoom;
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
    const newZoom = Math.min(5, Math.max(1, oldZoom * factor));
    if (newZoom === oldZoom) return;
    this.#zoom = newZoom;

    const cell = e.target.closest?.(".cll-cell");
    const host = this.#gridHost;
    const rect = host.getBoundingClientRect();
    const pointerX = e.clientX - rect.left;
    const pointerY = e.clientY - rect.top;

    this.#refitGrid();

    // Amène le centre de la cellule visée sous le curseur (position écran
    // inchangée). Recalculé de zéro à partir de son indice -> pas de dérive.
    // Le navigateur clampe si aucun débordement (rien à faire de plus).
    if (cell) {
      const cols = Number(grid.style.getPropertyValue("--cll-cols")) || 1;
      const rows = Number(grid.style.getPropertyValue("--cll-rows")) || 1;
      const gw = parseFloat(grid.style.width) || 0;
      const gh = parseFloat(grid.style.height) || 0;
      const cellCenterX = ((Number(cell.dataset.col) + 0.5) / cols) * gw;
      const cellCenterY = ((Number(cell.dataset.row) + 0.5) / rows) * gh;
      host.scrollLeft = cellCenterX - pointerX;
      host.scrollTop = cellCenterY - pointerY;
    }
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
    if (this.#subtitleInput) this.#subtitleInput.value = this.#state.subtitle;
    this.#render();
  }

  #render() {
    // false = bords (mur/tableau/porte/fenêtre) verrouillés : la classe coupe
    // l'affordance CSS (cf. style.css) et attachInteractions ignore les clics
    // sur .cll-edge. Lu depuis #settings (panneau), pas des options brutes.
    this.#root.classList.toggle(
      "cll-root--borders-locked",
      this.#settings.editableBorders === false,
    );
    const gridEl = renderGrid(this.#gridHost, this.#state, {
      nameFit: this.#settings.nameFit,
      levelFit: this.#settings.levelFit,
      showLevel: this.#settings.showLevel,
      nameDisplay: this.#settings.nameDisplay,
      zoom: this.#zoom,
    });
    this.#detachInteractions?.();
    this.#detachInteractions = attachInteractions(gridEl, {
      getState: () => this.#state,
      applyChange: (fn) => this.applyChange(fn),
      // #settings passe après #options : editableBorders du panneau prime.
      options: { ...this.#options, ...this.#settings },
      hostEl: this.#root,
    });
  }

  applyChange(fn) {
    this.#state = fn(this.#state);
    if (this.#subtitleInput) this.#subtitleInput.value = this.#state.subtitle;
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
    if (this.#subtitleInput) this.#subtitleInput.value = this.#state.subtitle;
    this.#render();
  }

  print() {
    const teacher = this.#options.teacher ?? this.#state.teacherOverride;
    // Réglages d'impression EFFECTIFS (panneau « Paramètres » compris) : la même
    // charge utile part vers onPrint (l'hôte les applique dans son propre moteur
    // PDF) et vers le printLayout intégré (dialogue navigateur). printPaper
    // n'est pas dans le panneau -> lu depuis les options.
    const printOpts = {
      teacher,
      logoUrl: this.#options.logoUrl,
      showLevel: this.#settings.showLevel,
      nameDisplay: this.#settings.nameDisplay,
      nameFit: this.#settings.nameFit,
      levelFit: this.#settings.levelFit,
      printOrientation: this.#settings.printOrientation,
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
    this.#gridHost?.removeEventListener("wheel", this.#gridWheelHandler);
    this.#container.replaceChildren();
  }
}

export * from "./model.js";
