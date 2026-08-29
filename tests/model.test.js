import { describe, it, expect } from "vitest";
import {
  createEmptyState,
  toggleDeskAt,
  removeDeskAt,
  rotateDeskAt,
  setDeskColorAt,
  assignStudentAt,
  unassignStudentAt,
  setBorderAt,
  clearBorderAt,
  fitGridToContentWithRing,
  serializeState,
  deserializeState,
  cellKey,
  hEdgeKey,
  vEdgeKey,
} from "../src/model.js";

describe("toggleDeskAt", () => {
  it("place un bureau vide sur une case vide", () => {
    const state = toggleDeskAt(createEmptyState(), 2, 3);
    expect(state.cells[cellKey(2, 3)]).toEqual({
      type: "desk",
      rotation: 0,
      color: null,
      student: null,
    });
  });

  it("retire l'élève d'abord, puis le bureau au second clic", () => {
    let state = toggleDeskAt(createEmptyState(), 1, 1);
    state = assignStudentAt(state, 1, 1, { name: "Ada" });
    state = toggleDeskAt(state, 1, 1); // 1er clic sur bureau occupé
    expect(state.cells[cellKey(1, 1)].student).toBeNull();
    expect(state.cells[cellKey(1, 1)]).toBeDefined();

    state = toggleDeskAt(state, 1, 1); // 2e clic : bureau vide -> supprimé
    expect(state.cells[cellKey(1, 1)]).toBeUndefined();
  });
});

describe("removeDeskAt / rotateDeskAt / setDeskColorAt", () => {
  it("supprime un bureau existant, ignore une case vide", () => {
    let state = toggleDeskAt(createEmptyState(), 0, 0);
    state = removeDeskAt(state, 0, 0);
    expect(state.cells[cellKey(0, 0)]).toBeUndefined();
    expect(removeDeskAt(state, 5, 5)).toBe(state); // no-op, même référence
  });

  it("fait tourner le bureau par pas de 90°, boucle à 360", () => {
    let state = toggleDeskAt(createEmptyState(), 0, 0);
    state = rotateDeskAt(state, 0, 0);
    expect(state.cells[cellKey(0, 0)].rotation).toBe(90);
    state = rotateDeskAt(rotateDeskAt(rotateDeskAt(state, 0, 0), 0, 0), 0, 0);
    expect(state.cells[cellKey(0, 0)].rotation).toBe(0);
  });

  it("applique une couleur", () => {
    let state = toggleDeskAt(createEmptyState(), 0, 0);
    state = setDeskColorAt(state, 0, 0, "#ff000080");
    expect(state.cells[cellKey(0, 0)].color).toBe("#ff000080");
  });
});

describe("assignStudentAt / unassignStudentAt", () => {
  it("crée le bureau si besoin en affectant un élève", () => {
    const state = assignStudentAt(createEmptyState(), 4, 4, {
      name: "Zoé",
      level: "CE2",
    });
    expect(state.cells[cellKey(4, 4)].student).toEqual({
      name: "Zoé",
      level: "CE2",
    });
  });

  it("désaffecte sans supprimer le bureau", () => {
    let state = assignStudentAt(createEmptyState(), 0, 0, { name: "X" });
    state = unassignStudentAt(state, 0, 0);
    expect(state.cells[cellKey(0, 0)].student).toBeNull();
    expect(state.cells[cellKey(0, 0)]).toBeDefined();
  });
});

describe("bordures", () => {
  it("pose puis retire une bordure", () => {
    let state = setBorderAt(createEmptyState(), hEdgeKey(0, 2), "porte");
    expect(state.edges[hEdgeKey(0, 2)]).toEqual({ type: "porte" });
    state = clearBorderAt(state, hEdgeKey(0, 2));
    expect(state.edges[hEdgeKey(0, 2)]).toBeUndefined();
  });

  it("refuse un type de bordure inconnu", () => {
    expect(() =>
      setBorderAt(createEmptyState(), vEdgeKey(0, 0), "canape"),
    ).toThrow();
  });
});

describe("fitGridToContentWithRing", () => {
  it("garde la grille par défaut quand rien n'est posé", () => {
    const state = fitGridToContentWithRing(createEmptyState(), {
      cols: 5,
      rows: 6,
    });
    expect(state.grid).toEqual({ cols: 5, rows: 6 });
  });

  it("resserre la grille au contenu + une couronne, et réindexe", () => {
    let state = createEmptyState({ cols: 5, rows: 6 });
    state = toggleDeskAt(state, 2, 3); // seul bureau du plan
    const fitted = fitGridToContentWithRing(state);

    // bounding box = {2,3}..{2,3} -> +1 couronne de chaque côté = 3x3
    expect(fitted.grid).toEqual({ cols: 3, rows: 3 });
    // le bureau doit désormais être au centre (1,1) de la nouvelle grille
    expect(fitted.cells[cellKey(1, 1)]).toBeDefined();
    expect(fitted.cells[cellKey(2, 3)]).toBeUndefined();
  });

  it("inclut les bordures dans le calcul de l'emprise", () => {
    let state = createEmptyState({ cols: 5, rows: 6 });
    state = setBorderAt(state, vEdgeKey(4, 4), "fenetre"); // bord droit, ligne 4 = hors grille de base
    const fitted = fitGridToContentWithRing(state);
    // row 4, col line 4 -> extent col [3,4], row [4,4]; +couronne -> couvre bien la bordure
    const remapped = Object.keys(fitted.edges)[0];
    expect(remapped).toBeDefined();
  });
});

describe("serialize / deserialize", () => {
  it("round-trip", () => {
    let state = toggleDeskAt(createEmptyState(), 1, 1);
    state = assignStudentAt(state, 1, 1, { name: "Léo", level: "CP" });
    const json = serializeState(state);
    const back = deserializeState(json);
    expect(back).toEqual(state);
  });

  it("comble les champs manquants d'un JSON incomplet", () => {
    const back = deserializeState("{}");
    expect(back.grid).toEqual({ cols: 5, rows: 6 });
    expect(back.cells).toEqual({});
    expect(back.edges).toEqual({});
  });
});
