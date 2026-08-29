import { describe, it, expect, vi, beforeEach } from "vitest";
import { ClassroomLayout } from "../src/index.js";

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
        "0_0": {
          type: "desk",
          rotation: 0,
          color: null,
          student: { name: "Ada" },
        },
      },
    }));

    // Re-queried after each click: renderGrid rebuilds the whole grid DOM on
    // every state change (see render.js), so any node reference from before
    // the previous render is stale.
    click(container.querySelector('[data-row="0"][data-col="0"]'));
    expect(layout.getState().cells["0_0"].student).toBeNull();
    expect(layout.getState().cells["0_0"]).toBeDefined();

    click(container.querySelector('[data-row="0"][data-col="0"]'));
    expect(layout.getState().cells["0_0"]).toBeUndefined();
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
      name: "Jean Dupont",
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

  it("right-clicking an empty border offers the tableau/porte/fenetre choice", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const edge = container.querySelector('.cll-edge[data-edge-key="h_0_0"]');
    click(edge, "contextmenu");
    expect(document.querySelectorAll(".cll-borderpicker-btn").length).toBe(3);
  });

  it("lets a door's opening side be flipped from its right-click menu", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    layout.applyChange((s) => ({
      ...s,
      edges: { h_0_0: { type: "porte", rotation: 0 } },
    }));

    click(
      container.querySelector('.cll-edge[data-edge-key="h_0_0"]'),
      "contextmenu",
    );
    const items = Array.from(document.querySelectorAll(".cll-menu-item")).map(
      (li) => li.textContent,
    );
    expect(items).toEqual(["Changer le sens d'ouverture", "Supprimer"]);

    click(document.querySelector(".cll-menu-item"));
    expect(layout.getState().edges.h_0_0.rotation).toBe(180);
  });

  it("only offers Supprimer for a non-door border (tableau/fenetre are symmetric)", async () => {
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
    expect(items).toEqual(["Supprimer"]);
  });
});
