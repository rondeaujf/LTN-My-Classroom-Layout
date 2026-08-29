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

  it("démarre sur une grille 5x6 vide par défaut", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const cells = container.querySelectorAll(".cll-cell");
    expect(cells.length).toBe(30);
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(0);
  });

  it("charge et redimensionne (couronne) la configuration persistée", async () => {
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

  it("clic sur une case vide crée un bureau, reclic le supprime", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    const firstCell = container.querySelector(".cll-cell");
    click(firstCell);
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(1);

    const desk = container.querySelector(".cll-cell--desk");
    click(desk);
    expect(container.querySelectorAll(".cll-cell--desk").length).toBe(0);
  });

  it("clic sur un bureau occupé retire l'élève avant de retirer le bureau", async () => {
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

    // Requête refaite après chaque clic : renderGrid reconstruit tout le DOM
    // de la grille à chaque changement d'état (cf. render.js), donc toute
    // référence à un nœud d'avant le rendu précédent est obsolète.
    click(container.querySelector('[data-row="0"][data-col="0"]'));
    expect(layout.getState().cells["0_0"].student).toBeNull();
    expect(layout.getState().cells["0_0"]).toBeDefined();

    click(container.querySelector('[data-row="0"][data-col="0"]'));
    expect(layout.getState().cells["0_0"]).toBeUndefined();
  });

  it("planifie une sauvegarde (debounce) et la flush à la destruction", async () => {
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

  it("ouvre un menu contextuel sur clic droit d'un bureau", async () => {
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
});
