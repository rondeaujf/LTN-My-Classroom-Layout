import { describe, it, expect, vi } from "vitest";
import { buildPrintSheet, printLayout, printableAreaPx } from "../src/print.js";
import {
  createEmptyState,
  toggleDeskAt,
  assignStudentAt,
  createTableAt,
  setTableStudentAt,
} from "../src/model.js";

// A one-desk state with an assigned, levelled student — enough to observe
// the name/level font bounds finalizeLayout writes (jsdom has no layout
// engine, so fitText's shrink loop never runs and the font stays at its
// `max`, which is exactly what these assertions check).
function oneDeskState() {
  let s = toggleDeskAt(createEmptyState({ cols: 3, rows: 3 }), 1, 1);
  s = assignStudentAt(s, 1, 1, {
    firstName: "Ada",
    lastName: "Lovelace",
    level: "CE2",
  });
  return s;
}

describe("buildPrintSheet", () => {
  it("returns a detached sheet (not attached to the document)", () => {
    const sheet = buildPrintSheet(createEmptyState());
    expect(sheet.className).toBe("cll-print-sheet");
    expect(sheet.isConnected).toBe(false);
    expect(sheet.querySelector(".cll-print-grid-host")).not.toBeNull();
  });

  it("shows the teacher/school banner when options.teacher is supplied", () => {
    const sheet = buildPrintSheet(createEmptyState(), {
      teacher: { firstName: "J.", lastName: "Doe", school: "École X" },
    });
    expect(sheet.querySelector(".cll-print-school").textContent).toBe(
      "École X",
    );
    expect(sheet.querySelector(".cll-print-teacher").textContent).toBe(
      "J. Doe",
    );
  });

  it("has no footer without options.logoUrl", () => {
    const sheet = buildPrintSheet(createEmptyState());
    expect(sheet.querySelector(".cll-print-footer")).toBeNull();
  });

  it("shows the logo at the bottom when options.logoUrl is supplied", () => {
    const sheet = buildPrintSheet(createEmptyState(), {
      logoUrl: "/logo.png",
    });
    const logo = sheet.querySelector(".cll-print-footer .cll-print-logo");
    expect(logo.tagName).toBe("IMG");
    expect(logo.src).toContain("/logo.png");
    // Last child: the footer sits at the bottom of the sheet.
    expect(sheet.lastElementChild.className).toBe("cll-print-footer");
  });

  it("crops the printed grid to content with no ring, leaving the live editing state untouched", () => {
    let state = createEmptyState({ cols: 14, rows: 14 });
    state = toggleDeskAt(state, 6, 7); // one desk, far from the big grid's edges

    const sheet = buildPrintSheet(state);
    const grid = sheet.querySelector(".cll-grid");
    // bounding box = {6,7}..{6,7}, no ring (unlike the load-time fit) -> 1x1
    expect(grid.style.getPropertyValue("--cll-cols")).toBe("1");
    expect(grid.style.getPropertyValue("--cll-rows")).toBe("1");
    // buildPrintSheet must not mutate the state it was given.
    expect(state.grid).toEqual({ cols: 14, rows: 14 });
  });

  it("defaults printOrientation/printPaper on the sheet dataset (portrait / A4)", () => {
    const sheet = buildPrintSheet(createEmptyState());
    expect(sheet.dataset.printOrientation).toBe("portrait");
    expect(sheet.dataset.printPaper).toBe("A4");
  });

  it("carries the requested printOrientation/printPaper on the sheet dataset for the host's own PDF renderer", () => {
    const sheet = buildPrintSheet(createEmptyState(), {
      printOrientation: "landscape",
      printPaper: "A3",
    });
    expect(sheet.dataset.printOrientation).toBe("landscape");
    expect(sheet.dataset.printPaper).toBe("A3");
  });

  it("forwards nameFit / levelFit into the rendered grid", () => {
    const sheet = buildPrintSheet(oneDeskState(), {
      nameFit: { max: 20 },
      levelFit: { max: 15 },
    });
    expect(sheet.querySelector(".cll-desk-name").style.fontSize).toBe("20px");
    expect(sheet.querySelector(".cll-desk-level").style.fontSize).toBe("15px");
  });

  it("badge font defaults to 8px (levelFit.max default)", () => {
    const sheet = buildPrintSheet(oneDeskState());
    expect(sheet.querySelector(".cll-desk-level").style.fontSize).toBe("8px");
  });

  it("renders round / oval tables and their label", () => {
    let s = createTableAt(createEmptyState({ cols: 4, rows: 4 }), 1, 1, 2, 3);
    s = setTableStudentAt(s, "1_1", { name: "Groupe A", level: "CE1" });
    const sheet = buildPrintSheet(s);
    const table = sheet.querySelector(".cll-table");
    expect(table).not.toBeNull();
    expect(table.classList.contains("cll-table--oval")).toBe(true);
    expect(sheet.querySelector(".cll-table-name").textContent).toBe("Groupe A");
  });

  it("chrome:false drops the banner and logo footer, keeping the bare grid", () => {
    const sheet = buildPrintSheet(createEmptyState(), {
      teacher: { firstName: "J.", lastName: "Doe", school: "École X" },
      logoUrl: "/logo.png",
      chrome: false,
    });
    expect(sheet.querySelector(".cll-print-header")).toBeNull();
    expect(sheet.querySelector(".cll-print-footer")).toBeNull();
    // still a usable sheet: grid + the datasets a host PDF renderer reads.
    expect(sheet.querySelector(".cll-print-grid-host")).not.toBeNull();
    expect(sheet.dataset.printOrientation).toBe("portrait");
    expect(sheet.dataset.printPaper).toBe("A4");
  });

  it("chrome defaults to true (banner still shown when omitted)", () => {
    const sheet = buildPrintSheet(createEmptyState(), {
      teacher: { firstName: "J.", lastName: "Doe", school: "École X" },
    });
    expect(sheet.querySelector(".cll-print-header")).not.toBeNull();
  });
});

describe("printableAreaPx", () => {
  it("A4 portrait ≈ 703 × 1032 px (page − 12 mm de marge / côté)", () => {
    const [w, h] = printableAreaPx("A4", "portrait");
    expect(Math.round(w)).toBe(703);
    expect(Math.round(h)).toBe(1032);
  });

  it("landscape échange largeur et hauteur", () => {
    const [w, h] = printableAreaPx("A4", "landscape");
    const [pw, ph] = printableAreaPx("A4", "portrait");
    expect(Math.round(w)).toBe(Math.round(ph));
    expect(Math.round(h)).toBe(Math.round(pw));
  });

  it("papier inconnu → repli A4", () => {
    expect(printableAreaPx("wat", "portrait")).toEqual(
      printableAreaPx("a4", "portrait"),
    );
  });
});

describe("printLayout", () => {
  it("s'exécute sans erreur et nettoie après window.print()", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    let state = toggleDeskAt(createEmptyState({ cols: 6, rows: 5 }), 2, 2);

    printLayout(state, { printPaper: "A4", printOrientation: "landscape" });

    expect(printSpy).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("afterprint"));
    expect(document.querySelector(".cll-print-sheet")).toBeNull();
    expect(document.body.classList.contains("cll-printing")).toBe(false);
    printSpy.mockRestore();
  });
});
