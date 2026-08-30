import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClassroomLayout } from "../src/index.js";
import { createTableAt, setTableStudentAt } from "../src/model.js";

// jsdom doesn't implement ResizeObserver (no real layout engine to observe
// in the first place) — every real target browser does, so this is a
// test-only stand-in, not something the module itself needs to guard
// against.
global.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

// jsdom has no createObjectURL — the export button only needs it to hand a
// Blob URL to an <a download>. Stub it so #downloadJson doesn't throw.
URL.createObjectURL ??= () => "blob:stub";
URL.revokeObjectURL ??= () => {};

function click(el, type = "click") {
  el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
}

describe("ClassroomLayout", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("starts on an empty 5x6 grid by default", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const cells = container.querySelectorAll(".cll-cell");
    expect(cells.length).toBe(30);
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(0);
  });

  it("loads and resizes (ring) the persisted configuration", async () => {
    const load = vi.fn().mockResolvedValue({
      version: 1,
      grid: { cols: 5, rows: 6 },
      cells: {
        "2_3": { type: "desk", rotation: 0, color: null, student: null },
      },
      edges: {},
      recentColors: [],
      subtitle: "",
      teacherOverride: null,
      meta: { updatedAt: null },
    });
    const layout = new ClassroomLayout(container, { persistence: { load } });
    await layout.ready;
    expect(load).toHaveBeenCalled();
    expect(layout.getState().grid).toEqual({ cols: 3, rows: 3 });
    expect(container.querySelectorAll(".cll-cell").length).toBe(9);
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(1);
  });

  it("clicking an empty cell creates a desk, clicking it again removes it", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const firstCell = container.querySelector(".cll-cell");
    click(firstCell);
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(1);

    const desk = container.querySelector(".cll-cell--desk");
    click(desk);
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(0);
  });

  it("clicking an occupied desk removes the student before removing the desk", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "2_2": {
          type: "desk",
          rotation: 0,
          color: null,
          student: { name: "Ada" },
        },
      },
    }));

    // Interior cell (2,2): a corner cell would trigger the outer-ring growth
    // (see growGridToKeepFreeRing, src/model.js) on the very click this test
    // is asserting on, reindexing it out from under the "0_0" key below —
    // growth has its own coverage, cf. "toggleDeskAt".

    // Re-queried after each click: renderGrid rebuilds the whole grid DOM on
    // every state change (see render.js), so any node reference from before
    // the previous render is stale.
    click(container.querySelector('[data-row="2"][data-col="2"]'));
    expect(layout.getState().cells["2_2"].student).toBeNull();
    expect(layout.getState().cells["2_2"]).toBeDefined();

    click(container.querySelector('[data-row="2"][data-col="2"]'));
    expect(layout.getState().cells["2_2"]).toBeUndefined();
  });

  it("keeps the student name centered on the desk-top rect's own true center, whatever the desk's rotation", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "0_0": {
          type: "desk",
          rotation: 0,
          color: null,
          student: { name: "Ada Lovelace" },
        },
      },
    }));

    // Unlike the level badge (anchored at a corner, which genuinely moves
    // relative to the desk when it rotates), the rect's own center never
    // moves relative to the desk's own rotation pivot — so the name's
    // anchor point must be identical at every rotation; only its
    // counter-rotation (to stay upright) changes. See RECT_HALF_HEIGHT in
    // src/render.js.
    let previousTop;
    for (const rotation of [0, 90, 180, 270]) {
      layout.applyChange((s) => ({
        ...s,
        cells: { "0_0": { ...s.cells["0_0"], rotation } },
      }));
      const nameEl = container.querySelector(".cll-desk-name");
      if (previousTop !== undefined) expect(nameEl.style.top).toBe(previousTop);
      previousTop = nameEl.style.top;
      expect(nameEl.style.transform).toBe(
        `translate(-50%, -50%) rotate(${-rotation}deg)`,
      );
    }
  });

  it("renders the level badge, counter-rotated to stay upright whatever the desk's rotation", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "0_0": {
          type: "desk",
          rotation: 0,
          color: null,
          student: { name: "Ada", level: "CE2" },
        },
      },
    }));

    // The actual top/left values depend on the badge's real rendered size
    // (offsetWidth/Height, read via a rAF-deferred pass so the node is
    // laid out first) — see positionLevelBadge in src/render.js — which
    // jsdom can't produce (no real layout engine: clientWidth/offsetWidth
    // are always 0), so the positioning *formula* is unit-tested directly,
    // with concrete numbers, in tests/render.test.js (plateauTopLeftLocal).
    // Here: just that the badge renders with the right text and stays
    // counter-rotated, whatever the desk's own rotation.
    for (const rotation of [0, 90, 180, 270]) {
      layout.applyChange((s) => ({
        ...s,
        cells: { "0_0": { ...s.cells["0_0"], rotation } },
      }));
      const levelEl = container.querySelector(".cll-desk-level");
      expect(levelEl.textContent).toBe("CE2");
      expect(levelEl.style.transform).toBe(`rotate(${-rotation}deg)`);
    }
  });

  it("schedules a debounced save and flushes it on destroy", async () => {
    vi.useFakeTimers();
    const save = vi.fn();
    const layout = new ClassroomLayout(container, { persistence: { save } });
    await layout.ready;

    const cell = container.querySelector(".cll-cell");
    click(cell);
    expect(save).not.toHaveBeenCalled();

    layout.destroy();
    expect(save).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("opens a context menu on right-click of a desk", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "0_0": { type: "desk", rotation: 0, color: null, student: null },
      },
    }));
    const cell = container.querySelector('[data-row="0"][data-col="0"]');
    click(cell, "contextmenu");
    const items = Array.from(document.querySelectorAll(".cll-menu-item")).map(
      (li) => li.textContent,
    );
    expect(items).toContain("Affecter un élève…");
    expect(items).toContain("Faire pivoter (90°)");
    expect(items).toContain("Supprimer le bureau");
  });

  it("offers the 4 half-shift directions, picking one sets it, picking it again clears it", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "0_0": { type: "desk", rotation: 0, color: null, student: null },
      },
    }));
    const cell = container.querySelector('[data-row="0"][data-col="0"]');

    click(cell, "contextmenu");
    let items = Array.from(document.querySelectorAll(".cll-menu-item")).map(
      (li) => li.textContent,
    );
    expect(items).toContain("Décaler vers le haut");
    expect(items).toContain("Décaler vers le bas");
    expect(items).toContain("Décaler vers la gauche");
    expect(items).toContain("Décaler vers la droite");

    click(
      Array.from(document.querySelectorAll(".cll-menu-item")).find(
        (li) => li.textContent === "Décaler vers la droite",
      ),
    );
    expect(layout.getState().cells["0_0"].halfShift).toBe("right");

    // The grid is fully rebuilt on every change (see renderGrid) — re-query
    // instead of reusing `cell`, now detached from the document.
    click(
      container.querySelector('[data-row="0"][data-col="0"]'),
      "contextmenu",
    );
    click(
      Array.from(document.querySelectorAll(".cll-menu-item")).find(
        (li) => li.textContent === "Décaler vers la droite ✓",
      ),
    );
    expect(layout.getState().cells["0_0"].halfShift).toBeNull();
  });

  it("lets the documented teacher be assigned to more than one desk", async () => {
    const layout = new ClassroomLayout(container, {
      teacher: { firstName: "Jean", lastName: "Dupont" },
    });
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "0_0": { type: "desk", rotation: 0, color: null, student: null },
        "0_1": { type: "desk", rotation: 0, color: null, student: null },
      },
    }));

    click(
      container.querySelector('[data-row="0"][data-col="0"]'),
      "contextmenu",
    );
    click(document.querySelector(".cll-menu-item"));
    click(document.querySelector(".cll-student-list li"));
    expect(layout.getState().cells["0_0"].student).toEqual({
      id: "__teacher__",
      firstName: "Jean",
      lastName: "Dupont",
      name: undefined,
      level: undefined,
    });

    // Still offered for a second desk: the roster-uniqueness rule doesn't
    // apply to the teacher entry.
    click(
      container.querySelector('[data-row="0"][data-col="1"]'),
      "contextmenu",
    );
    click(document.querySelector(".cll-menu-item"));
    expect(document.querySelector(".cll-student-list li")).not.toBeNull();
  });

  it("assigns a manually-entered name+level via the 'Ajouter un label' dialog", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "0_0": { type: "desk", rotation: 0, color: null, student: null },
      },
    }));

    click(
      container.querySelector('[data-row="0"][data-col="0"]'),
      "contextmenu",
    );
    click(document.querySelector(".cll-menu-item")); // "Affecter un élève…"
    click(document.querySelector(".cll-student-add-label"));

    const dialog = document.querySelector(".cll-dialog");
    expect(dialog).not.toBeNull();
    const inputs = dialog.querySelectorAll("input");
    inputs[0].value = "Léa";
    inputs[1].value = "Martin";
    inputs[2].value = "CE1";
    click(document.querySelector(".cll-dialog__btn--primary"));

    expect(layout.getState().cells["0_0"].student).toEqual({
      firstName: "Léa",
      lastName: "Martin",
      level: "CE1",
    });
    expect(document.querySelector(".cll-dialog")).toBeNull();
  });

  it("right-clicking an empty border offers the tableau/porte/fenetre/mur choice", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const edge = container.querySelector('.cll-edge[data-edge-key="h_0_0"]');
    click(edge, "contextmenu");
    expect(document.querySelectorAll(".cll-borderpicker-btn").length).toBe(4);
  });

  it("lets a door's opening side and orientation be changed from its right-click menu", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      edges: { h_0_0: { type: "porte", rotation: 0, flip: false } },
    }));

    click(
      container.querySelector('.cll-edge[data-edge-key="h_0_0"]'),
      "contextmenu",
    );
    const items = Array.from(document.querySelectorAll(".cll-menu-item")).map(
      (li) => li.textContent,
    );
    expect(items).toEqual([
      "Changer le sens d'ouverture",
      "Retourner la porte",
      "Supprimer",
    ]);

    click(document.querySelector(".cll-menu-item"));
    expect(layout.getState().edges.h_0_0.rotation).toBe(180);

    click(
      container.querySelector('.cll-edge[data-edge-key="h_0_0"]'),
      "contextmenu",
    );
    click(document.querySelectorAll(".cll-menu-item")[1]);
    expect(layout.getState().edges.h_0_0.flip).toBe(true);
  });

  it("only offers Supprimer for fenetre (its icon is symmetric)", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      edges: { h_0_0: { type: "fenetre", rotation: 0 } },
    }));

    click(
      container.querySelector('.cll-edge[data-edge-key="h_0_0"]'),
      "contextmenu",
    );
    const items = Array.from(document.querySelectorAll(".cll-menu-item")).map(
      (li) => li.textContent,
    );
    expect(items).toEqual(["Supprimer"]);
  });

  it("lets a tableau be flipped (chalk tray side) from its right-click menu", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      edges: { h_0_0: { type: "tableau", rotation: 0 } },
    }));

    click(
      container.querySelector('.cll-edge[data-edge-key="h_0_0"]'),
      "contextmenu",
    );
    const items = Array.from(document.querySelectorAll(".cll-menu-item")).map(
      (li) => li.textContent,
    );
    expect(items).toEqual(["Retourner le tableau", "Supprimer"]);

    click(document.querySelector(".cll-menu-item"));
    expect(layout.getState().edges.h_0_0.flip).toBe(true);
  });
});

describe("print()", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("calls options.onPrint instead of window.print() when supplied", async () => {
    const onPrint = vi.fn();
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const layout = new ClassroomLayout(container, {
      teacher: { firstName: "J.", lastName: "Doe" },
      logoUrl: "/logo.png",
      onPrint,
    });
    await layout.ready;

    layout.print();

    expect(onPrint).toHaveBeenCalledTimes(1);
    const [state, { teacher, logoUrl }] = onPrint.mock.calls[0];
    expect(state).toEqual(layout.getState());
    expect(teacher).toEqual({ firstName: "J.", lastName: "Doe" });
    expect(logoUrl).toBe("/logo.png");
    expect(printSpy).not.toHaveBeenCalled();

    printSpy.mockRestore();
  });

  it("falls back to window.print() without options.onPrint", async () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    const layout = new ClassroomLayout(container);
    await layout.ready;

    layout.print();

    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });

  it("options.showLevel: false hides the level badge entirely (default: shown)", async () => {
    const layout = new ClassroomLayout(container, { showLevel: false });
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "2_2": {
          type: "desk",
          rotation: 0,
          color: null,
          student: { firstName: "Ada", lastName: "Lovelace", level: "Grade 5" },
        },
      },
    }));

    expect(container.querySelector(".cll-desk-level")).toBeNull();
    expect(container.querySelector(".cll-desk-name").textContent).toBe(
      "Ada Lovelace",
    );
  });

  it('options.nameDisplay: "firstName" shows just the first name on the desk', async () => {
    const layout = new ClassroomLayout(container, {
      nameDisplay: "firstName",
    });
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "2_2": {
          type: "desk",
          rotation: 0,
          color: null,
          student: { firstName: "Ada", lastName: "Lovelace", level: "Grade 5" },
        },
      },
    }));

    expect(container.querySelector(".cll-desk-name").textContent).toBe("Ada");
    // Unaffected by nameDisplay — still shown by default.
    expect(container.querySelector(".cll-desk-level").textContent).toBe(
      "Grade 5",
    );
  });

  it("forwards showLevel/nameDisplay to options.onPrint, for a host app driving its own print/export", async () => {
    const onPrint = vi.fn();
    const layout = new ClassroomLayout(container, {
      showLevel: false,
      nameDisplay: "firstName",
      onPrint,
    });
    await layout.ready;

    layout.print();

    const [, { showLevel, nameDisplay }] = onPrint.mock.calls[0];
    expect(showLevel).toBe(false);
    expect(nameDisplay).toBe("firstName");
  });

  it("a roster pick keeps firstName/lastName separate (not pre-joined) so nameDisplay can split it later", async () => {
    const layout = new ClassroomLayout(container, {
      students: [{ id: "1", firstName: "Ada", lastName: "Lovelace" }],
    });
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "0_0": { type: "desk", rotation: 0, color: null, student: null },
      },
    }));

    click(
      container.querySelector('[data-row="0"][data-col="0"]'),
      "contextmenu",
    );
    click(document.querySelector(".cll-menu-item"));
    click(document.querySelector(".cll-student-list li"));

    expect(layout.getState().cells["0_0"].student).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
    });
  });
});

describe("editableBorders", () => {
  let container;

  beforeEach(() => {
    // Floating panels (borderpicker, context menu) append to document.body
    // and aren't torn down between tests — start each of these from a clean
    // body so a "nothing opened" assertion can't see a previous test's panel.
    document.body.replaceChildren();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("is on by default: no lock class, right-clicking an empty border opens the picker", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    expect(
      container
        .querySelector(".cll-root")
        .classList.contains("cll-root--borders-locked"),
    ).toBe(false);

    click(
      container.querySelector('.cll-edge[data-edge-key="h_0_0"]'),
      "contextmenu",
    );
    expect(document.querySelectorAll(".cll-borderpicker-btn").length).toBe(4);
  });

  it("false: root gets .cll-root--borders-locked and border clicks do nothing", async () => {
    const layout = new ClassroomLayout(container, { editableBorders: false });
    await layout.ready;
    expect(
      container
        .querySelector(".cll-root")
        .classList.contains("cll-root--borders-locked"),
    ).toBe(true);

    const edge = container.querySelector('.cll-edge[data-edge-key="h_0_0"]');
    click(edge, "contextmenu");
    expect(document.querySelector(".cll-borderpicker-btn")).toBeNull();

    click(edge);
    expect(layout.getState().edges).toEqual({});
  });

  it("false: desks stay fully editable", async () => {
    const layout = new ClassroomLayout(container, { editableBorders: false });
    await layout.ready;
    click(container.querySelector(".cll-cell"));
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(1);
  });
});

describe("levelFit / print settings", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  function addLevelledDesk(layout) {
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "0_0": {
          type: "desk",
          rotation: 0,
          color: null,
          student: { firstName: "Ada", level: "CE2" },
        },
      },
    }));
  }

  it("caps the level badge font at 8px by default", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    addLevelledDesk(layout);
    expect(container.querySelector(".cll-desk-level").style.fontSize).toBe(
      "8px",
    );
  });

  it("honors options.levelFit.max", async () => {
    const layout = new ClassroomLayout(container, { levelFit: { max: 15 } });
    await layout.ready;
    addLevelledDesk(layout);
    expect(container.querySelector(".cll-desk-level").style.fontSize).toBe(
      "15px",
    );
  });

  it("forwards nameFit/levelFit/printOrientation/printPaper to options.onPrint", async () => {
    const onPrint = vi.fn();
    const layout = new ClassroomLayout(container, {
      nameFit: { max: 11 },
      levelFit: { max: 7 },
      printOrientation: "landscape",
      printPaper: "A4",
      onPrint,
    });
    await layout.ready;

    layout.print();

    const [, opts] = onPrint.mock.calls[0];
    // onPrint now gets the effective (panel-aware) settings — the fit objects
    // come back normalized with their `min` (default 5).
    expect(opts.nameFit).toEqual({ max: 11, min: 5 });
    expect(opts.levelFit).toEqual({ max: 7, min: 5 });
    expect(opts.printOrientation).toBe("landscape");
    expect(opts.printPaper).toBe("A4");
  });
});

describe("wheel zoom", () => {
  let container;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  const wheel = (host, deltaY) => {
    const ev = new WheelEvent("wheel", {
      deltaY,
      bubbles: true,
      cancelable: true,
    });
    host.dispatchEvent(ev);
    return ev;
  };

  it("wheel over the grid host is preventDefault'd (no page/dialog scroll)", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    expect(
      wheel(container.querySelector(".cll-grid-host"), -120).defaultPrevented,
    ).toBe(true);
  });

  it("starts at zoom 1 and never dezooms below it (fitted view = floor)", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const host = container.querySelector(".cll-grid-host");
    expect(layout.zoom).toBe(1);

    for (let i = 0; i < 5; i++) wheel(host, 120); // wheel down = zoom out
    expect(layout.zoom).toBe(1);
  });

  it("wheel up zooms in, capped at 5", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const host = container.querySelector(".cll-grid-host");

    wheel(host, -120);
    expect(layout.zoom).toBeGreaterThan(1);

    for (let i = 0; i < 60; i++) wheel(host, -120);
    expect(layout.zoom).toBe(5);

    // and back down, floored at 1
    for (let i = 0; i < 60; i++) wheel(host, 120);
    expect(layout.zoom).toBe(1);
  });

  it("zooming with the pointer over a cell re-anchors on that cell without throwing", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const cell = container.querySelector('[data-row="2"][data-col="3"]');
    // jsdom has no layout engine (rects/scroll are 0), so this exercises the
    // cell-anchor branch — it must read the cell's row/col and not throw.
    expect(() => wheel(cell, -120)).not.toThrow();
    expect(layout.zoom).toBeGreaterThan(1);
  });
});

describe("Paramètres panel", () => {
  let container;

  beforeEach(() => {
    document.body.replaceChildren();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  const field = (root, labelText, sel) => {
    const f = [...root.querySelectorAll(".cll-settings-field")].find(
      (el) => el.querySelector("span")?.textContent === labelText,
    );
    return f?.querySelector(sel);
  };

  const levelledDesk = (layout) =>
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "0_0": {
          type: "desk",
          rotation: 0,
          color: null,
          student: { firstName: "Ada", level: "CE2" },
        },
      },
    }));

  it("toggle shows/hides the panel", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const toggle = container.querySelector(".cll-settings-toggle");
    const panel = container.querySelector(".cll-settings-panel");
    // Closed by default: no .is-open (CSS: .cll-settings-panel { display:none }).
    expect(panel.classList.contains("is-open")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    click(toggle);
    expect(panel.classList.contains("is-open")).toBe(true);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");

    click(toggle);
    expect(panel.classList.contains("is-open")).toBe(false);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("controls start from the constructor options", async () => {
    const layout = new ClassroomLayout(container, {
      printOrientation: "landscape",
      nameDisplay: "firstName",
      showLevel: false,
      editableBorders: false,
      nameFit: { max: 11 },
    });
    await layout.ready;
    const root = container;
    expect(field(root, "Orientation", "select").value).toBe("landscape");
    expect(field(root, "Type de nom", "select").value).toBe("firstName");
    expect(field(root, "Badges de niveau", "input").checked).toBe(false);
    expect(field(root, "Bordures modifiables", "input").checked).toBe(false);
    expect(field(root, "Taille du nom (px)", "input").value).toBe("11");
  });

  it("orientation select feeds the effective settings passed to onPrint", async () => {
    const onPrint = vi.fn();
    const layout = new ClassroomLayout(container, {
      printOrientation: "portrait",
      onPrint,
    });
    await layout.ready;
    const sel = field(container, "Orientation", "select");
    sel.value = "landscape";
    sel.dispatchEvent(new Event("change", { bubbles: true }));

    layout.print();
    expect(onPrint.mock.calls[0][1].printOrientation).toBe("landscape");
  });

  it("badges toggle adds/removes the level badge live", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    levelledDesk(layout);
    expect(container.querySelector(".cll-desk-level")).not.toBeNull();

    const cb = field(container, "Badges de niveau", "input");
    cb.checked = false;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    expect(container.querySelector(".cll-desk-level")).toBeNull();
  });

  it("borders toggle locks/unlocks border editing live", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const root = container.querySelector(".cll-root");
    expect(root.classList.contains("cll-root--borders-locked")).toBe(false);

    const cb = field(container, "Bordures modifiables", "input");
    cb.checked = false;
    cb.dispatchEvent(new Event("change", { bubbles: true }));
    expect(
      container
        .querySelector(".cll-root")
        .classList.contains("cll-root--borders-locked"),
    ).toBe(true);

    click(
      container.querySelector('.cll-edge[data-edge-key="h_0_0"]'),
      "contextmenu",
    );
    expect(document.querySelector(".cll-borderpicker-btn")).toBeNull();
  });

  it("font control drives the name font; the badge follows at the initial ratio, floored at 5", async () => {
    const layout = new ClassroomLayout(container, {
      nameFit: { max: 12 },
      levelFit: { max: 6 }, // ratio 0.5
    });
    await layout.ready;
    levelledDesk(layout);

    const input = field(container, "Taille du nom (px)", "input");
    input.value = "16";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    expect(container.querySelector(".cll-desk-name").style.fontSize).toBe(
      "16px",
    );
    expect(container.querySelector(".cll-desk-level").style.fontSize).toBe(
      "8px",
    );

    input.value = "5";
    input.dispatchEvent(new Event("change", { bubbles: true }));
    // 5 * 0.5 = 2.5 -> would round to 3, floored to 5
    expect(container.querySelector(".cll-desk-level").style.fontSize).toBe(
      "5px",
    );
  });
});

describe("round / oval tables", () => {
  let container;

  beforeEach(() => {
    document.body.replaceChildren();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  const mouse = (el, type, opts = {}) =>
    el.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        button: 0,
        ...opts,
      }),
    );

  const menuItems = () =>
    Array.from(document.querySelectorAll(".cll-menu-item")).map(
      (li) => li.textContent,
    );

  it("drag over 2 empty cells then confirm creates an oval table", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const a = container.querySelector('[data-row="2"][data-col="2"]');
    const b = container.querySelector('[data-row="2"][data-col="3"]');

    mouse(a, "mousedown");
    mouse(b, "mousemove");
    mouse(b, "mouseup");

    expect(menuItems()).toEqual(["Créer une table ovale (2×1)"]);
    document.querySelector(".cll-menu-item").click();

    expect(layout.getState().tables["2_2"]).toMatchObject({
      w: 2,
      h: 1,
      shape: "oval",
    });
    expect(container.querySelector(".cll-table")).not.toBeNull();
  });

  it("a plain click (no drag) still makes a desk, not a table", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const cell = container.querySelector('[data-row="2"][data-col="2"]');
    mouse(cell, "mousedown");
    mouse(cell, "mouseup");
    cell.dispatchEvent(
      new MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(1);
    expect(layout.getState().tables).toEqual({});
  });

  it("right-click an empty cell offers 'Créer une table ronde' (1×1)", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const cell = container.querySelector('[data-row="1"][data-col="1"]');
    cell.dispatchEvent(
      new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
    );
    expect(menuItems()).toContain("Créer une table ronde");
    Array.from(document.querySelectorAll(".cll-menu-item"))
      .find((li) => li.textContent === "Créer une table ronde")
      .click();
    expect(layout.getState().tables["1_1"]).toMatchObject({
      w: 1,
      h: 1,
      shape: "round",
    });
  });

  it("right-click a table opens its own menu", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => createTableAt(s, 1, 1, 2, 2));

    container
      .querySelector(".cll-table")
      .dispatchEvent(
        new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
      );
    const items = menuItems();
    expect(items).toContain("Affecter un élève…");
    expect(items).toContain("Couleur…");
    expect(items).toContain("Supprimer la table");
  });

  it("a table shows its student's label and level badge", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) =>
      setTableStudentAt(createTableAt(s, 1, 1, 2, 2), "1_1", {
        firstName: "Ada",
        lastName: "Lovelace",
        level: "CE2",
      }),
    );
    expect(container.querySelector(".cll-table-name").textContent).toBe(
      "Ada Lovelace",
    );
    expect(container.querySelector(".cll-table-level").textContent).toBe("CE2");
  });

  it("options.showLevel: false hides the table's badge too", async () => {
    const layout = new ClassroomLayout(container, { showLevel: false });
    await layout.ready;
    layout.applyChange((s) =>
      setTableStudentAt(createTableAt(s, 1, 1, 2, 2), "1_1", {
        firstName: "Ada",
        level: "CE2",
      }),
    );
    expect(container.querySelector(".cll-table-name").textContent).toBe("Ada");
    expect(container.querySelector(".cll-table-level")).toBeNull();
  });

  it("left-click removes an empty table / unassigns an occupied one", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) =>
      setTableStudentAt(createTableAt(s, 1, 1, 2, 2), "1_1", { name: "G" }),
    );

    container
      .querySelector(".cll-table")
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    expect(layout.getState().tables["1_1"].student).toBeNull();

    container
      .querySelector(".cll-table")
      .dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    expect(layout.getState().tables["1_1"]).toBeUndefined();
  });
});

describe("import / export + reset (Paramètres panel)", () => {
  let container;

  beforeEach(() => {
    document.body.replaceChildren();
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  const actionBtn = (root, label) =>
    Array.from(root.querySelectorAll(".cll-settings-action-btn")).find(
      (b) => b.textContent === label,
    );

  const withDeskAndStudent = (layout) =>
    layout.applyChange((s) => ({
      ...s,
      cells: {
        "1_1": {
          type: "desk",
          rotation: 0,
          color: null,
          student: { id: "9", firstName: "Ada" },
        },
      },
    }));

  it("exportJsonPayload() carries the roster and the current layout", async () => {
    const students = [{ id: "1", firstName: "Ada", lastName: "Lovelace" }];
    const layout = new ClassroomLayout(container, { students });
    await layout.ready;
    withDeskAndStudent(layout);

    const p = layout.exportJsonPayload();
    expect(p.students).toEqual(students);
    expect(p.layout).toEqual(layout.getState());
    expect(p.layout.cells["1_1"].student.firstName).toBe("Ada");
  });

  it("exportJsonPayload(scope) keeps only the requested part", async () => {
    const students = [{ id: "1", firstName: "Ada" }];
    const layout = new ClassroomLayout(container, { students });
    await layout.ready;

    const s = layout.exportJsonPayload("students");
    expect(s.students).toEqual(students);
    expect(s.layout).toBeUndefined();

    const l = layout.exportJsonPayload("layout");
    expect(l.layout).toEqual(layout.getState());
    expect(l.students).toBeUndefined();
  });

  it("importJson(payload, scope) applies only the requested part", async () => {
    const layout = new ClassroomLayout(container, {
      students: [{ id: "0", firstName: "Old" }],
    });
    await layout.ready;
    const before = layout.getState();
    const payload = {
      students: [{ id: "1", firstName: "New" }],
      layout: {
        grid: { cols: 5, rows: 6 },
        cells: {
          "2_2": { type: "desk", rotation: 0, color: null, student: null },
        },
        edges: {},
        tables: {},
      },
    };

    layout.importJson(payload, "students");
    expect(layout.exportJsonPayload().students[0].firstName).toBe("New");
    expect(layout.getState().cells).toEqual(before.cells); // layout untouched

    layout.importJson(payload, "layout");
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(1);
  });

  it("the Actions row has a Portée scope select (both / students / layout)", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const sel = container.querySelector(".cll-settings-scope");
    expect(sel).not.toBeNull();
    expect(Array.from(sel.options).map((o) => o.value)).toEqual([
      "both",
      "students",
      "layout",
    ]);
    expect(sel.value).toBe("both");
  });

  it("importJson({students}) swaps the roster the picker offers", async () => {
    const layout = new ClassroomLayout(container, { students: [] });
    await layout.ready;
    layout.importJson({
      students: [{ id: "42", firstName: "Niels", lastName: "Bohr" }],
    });
    expect(layout.exportJsonPayload().students).toEqual([
      { id: "42", firstName: "Niels", lastName: "Bohr" },
    ]);
  });

  it("importJson({layout}) replaces the layout and persists it", async () => {
    const save = vi.fn();
    const layout = new ClassroomLayout(container, { persistence: { save } });
    await layout.ready;
    vi.useFakeTimers();

    layout.importJson({
      layout: {
        grid: { cols: 5, rows: 6 },
        cells: {
          "2_2": { type: "desk", rotation: 0, color: null, student: null },
        },
        edges: {},
        tables: {},
      },
    });
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(1);

    layout.destroy(); // flushes the debounced save
    expect(save).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("import round-trips an export", async () => {
    const a = new ClassroomLayout(container, {
      students: [{ id: "1", firstName: "X" }],
    });
    await a.ready;
    withDeskAndStudent(a);
    const payload = a.exportJsonPayload();

    const other = document.createElement("div");
    document.body.appendChild(other);
    const b = new ClassroomLayout(other, {});
    await b.ready;
    b.importJson(payload);

    expect(b.exportJsonPayload().students).toEqual(payload.students);
    expect(b.getState().cells["1_1"].student.firstName).toBe("Ada");
  });

  it("'Désaffecter les élèves' clears every student, keeps the furniture", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) =>
      setTableStudentAt(
        {
          ...s,
          cells: {
            "1_1": {
              type: "desk",
              rotation: 0,
              color: null,
              student: { name: "A" },
            },
          },
          tables: {
            "3_3": {
              w: 2,
              h: 2,
              shape: "round",
              color: null,
              student: { name: "B" },
            },
          },
        },
        "3_3",
        { name: "B" },
      ),
    );

    click(actionBtn(container, "Désaffecter les élèves"));
    expect(layout.getState().cells["1_1"].student).toBeNull();
    expect(layout.getState().cells["1_1"].type).toBe("desk");
    expect(layout.getState().tables["3_3"].student).toBeNull();
    expect(layout.getState().tables["3_3"].w).toBe(2);
  });

  it("'Effacer tout' resets to the default empty grid", async () => {
    const layout = new ClassroomLayout(container, {
      gridDefault: { cols: 4, rows: 4 },
    });
    await layout.ready;
    withDeskAndStudent(layout);
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(1);

    click(actionBtn(container, "Effacer tout"));
    expect(layout.getState().cells).toEqual({});
    expect(layout.getState().tables).toEqual({});
    expect(layout.getState().grid).toEqual({ cols: 4, rows: 4 });
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(0);
  });

  it("'Exporter (JSON)' triggers a download without throwing", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const clickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    click(actionBtn(container, "Exporter (JSON)"));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});
