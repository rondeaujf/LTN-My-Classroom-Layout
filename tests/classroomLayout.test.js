import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClassroomLayout } from "../src/index.js";

// jsdom doesn't implement ResizeObserver (no real layout engine to observe
// in the first place) — every real target browser does, so this is a
// test-only stand-in, not something the module itself needs to guard
// against.
global.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

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
