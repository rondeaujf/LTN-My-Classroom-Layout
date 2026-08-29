import { describe, it, expect } from "vitest";
import { buildPrintSheet } from "../src/print.js";
import { createEmptyState, toggleDeskAt } from "../src/model.js";

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
});
