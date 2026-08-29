import { describe, it, expect } from "vitest";
import {
  plateauTopLeftLocal,
  positionLevelBadge,
  rectsOverlap,
  studentLabel,
  fitGridToHost,
} from "../src/render.js";

// Pure geometry: which corner of the desk-top rect (in the desk's own
// local, pre-rotation coordinates) ends up at the screen top-left once the
// desk's own rotation is applied — see the comment on plateauTopLeftLocal
// in src/render.js. Verified against a real rendered page (not just this
// derivation) before landing on this formula.
describe("plateauTopLeftLocal", () => {
  it("0°: the rect's own top-left", () => {
    expect(plateauTopLeftLocal(0, 8)).toEqual([0, 8]);
  });

  it("90°: the rect's own bottom-left", () => {
    expect(plateauTopLeftLocal(90, 8)).toEqual([0, 58]);
  });

  it("180°: the rect's own bottom-right", () => {
    expect(plateauTopLeftLocal(180, 8)).toEqual([100, 58]);
  });

  it("270°: the rect's own top-right", () => {
    expect(plateauTopLeftLocal(270, 8)).toEqual([100, 8]);
  });

  it("unknown rotation falls back to 0°", () => {
    expect(plateauTopLeftLocal(45, 8)).toEqual(plateauTopLeftLocal(0, 8));
  });

  it("follows topMargin (e.g. 0 for a 'stuck' desk, see buildDeskSvg)", () => {
    expect(plateauTopLeftLocal(0, 0)).toEqual([0, 0]);
    expect(plateauTopLeftLocal(90, 0)).toEqual([0, 50]);
    expect(plateauTopLeftLocal(180, 0)).toEqual([100, 50]);
    expect(plateauTopLeftLocal(270, 0)).toEqual([100, 0]);
  });
});

// jsdom has no real layout engine (offsetWidth/Height are always 0, so this
// can't be exercised end-to-end through the DOM — see
// tests/classroomLayout.test.js) — a plain object standing in for the
// level badge element lets the actual positioning math be checked with
// concrete numbers instead.
function fakeLevelEl(width, height) {
  return { offsetWidth: width, offsetHeight: height, style: {} };
}

// Desk size and badge size matched to an actual rendered case (see the
// discussion around badge3/badge4.png, 2026-08-29) that exposed the
// previous formula's bug: it treated the already-local corner from
// plateauTopLeftLocal as if it needed a *separate* forward+inverse
// rotation round-trip, which is the identity only at 0°/180° (where
// sin(rotation) = 0) — silently correct there, broken at 90°/270°.
const DESK_SIZE = 178;

// positionLevelBadge writes the badge's *local* (pre-rotation) layout
// position — the desk container's own `rotate()` (a separate, later CSS
// transform, see buildCell) is what carries it to its actual screen
// position. To check "does the badge end up inside the rotated plateau on
// screen", that same forward rotation has to be applied here too — this
// mirrors the desk's rotate(rotation deg) around its own center.
function screenCenterOf(el, deskSize, rotation) {
  const leftPx = (parseFloat(el.style.left) / 100) * deskSize;
  const topPx = (parseFloat(el.style.top) / 100) * deskSize;
  const localCenterX = leftPx + el.offsetWidth / 2;
  const localCenterY = topPx + el.offsetHeight / 2;
  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const center = deskSize / 2;
  const relX = localCenterX - center;
  const relY = localCenterY - center;
  return [
    center + (cos * relX - sin * relY),
    center + (sin * relX + cos * relY),
  ];
}

describe("positionLevelBadge", () => {
  it("0°: badge center is inset (margin + half its size) from the rect's own top-left", () => {
    const el = fakeLevelEl(38, 14);
    positionLevelBadge(el, DESK_SIZE, 0, false);
    // margin(4) + halfWidth(19) = 23px right of corner x=0; margin(4) +
    // halfHeight(7) = 11px down from corner y=8%*178=14.24 — minus the
    // badge's own half-size again to get its top-left (CSS position).
    expect(parseFloat(el.style.left)).toBeCloseTo(
      ((23 - 19) / DESK_SIZE) * 100,
      3,
    );
    expect(parseFloat(el.style.top)).toBeCloseTo(
      ((14.24 + 11 - 7) / DESK_SIZE) * 100,
      3,
    );
  });

  it("90°: the badge lands inside the rotated rect's own screen bounds (x:[42%,92%] of the desk)", () => {
    const el = fakeLevelEl(38, 14);
    positionLevelBadge(el, DESK_SIZE, 90, false);
    const [centerX, centerY] = screenCenterOf(el, DESK_SIZE, 90);
    expect(centerX / DESK_SIZE).toBeGreaterThan(0.42);
    expect(centerX / DESK_SIZE).toBeLessThan(0.92);
    expect(centerY / DESK_SIZE).toBeGreaterThan(0);
    expect(centerY / DESK_SIZE).toBeLessThan(1);
  });

  it("180°: the badge lands inside the rotated rect's own screen bounds (y:[42%,92%] of the desk)", () => {
    const el = fakeLevelEl(38, 14);
    positionLevelBadge(el, DESK_SIZE, 180, false);
    const [centerX, centerY] = screenCenterOf(el, DESK_SIZE, 180);
    expect(centerX / DESK_SIZE).toBeGreaterThan(0);
    expect(centerX / DESK_SIZE).toBeLessThan(1);
    expect(centerY / DESK_SIZE).toBeGreaterThan(0.42);
    expect(centerY / DESK_SIZE).toBeLessThan(0.92);
  });

  it("270°: the badge lands inside the rotated rect's own screen bounds (x:[8%,58%] of the desk)", () => {
    const el = fakeLevelEl(38, 14);
    positionLevelBadge(el, DESK_SIZE, 270, false);
    const [centerX, centerY] = screenCenterOf(el, DESK_SIZE, 270);
    expect(centerX / DESK_SIZE).toBeGreaterThan(0.08);
    expect(centerX / DESK_SIZE).toBeLessThan(0.58);
    expect(centerY / DESK_SIZE).toBeGreaterThan(0);
    expect(centerY / DESK_SIZE).toBeLessThan(1);
  });

  it("90° + stuck: still lands inside the (shifted) rotated rect's screen bounds (x:[36%,86%] of the desk)", () => {
    const el = fakeLevelEl(38, 14);
    positionLevelBadge(el, DESK_SIZE, 90, true);
    const [centerX, centerY] = screenCenterOf(el, DESK_SIZE, 90);
    // Stuck: the rect itself shifts to y:[0,50] instead of [8,58] (see
    // buildDeskSvg) — its rotated screen bounds shift by the same 8 units.
    expect(centerX / DESK_SIZE).toBeGreaterThan(0.34);
    expect(centerX / DESK_SIZE).toBeLessThan(0.84);
    expect(centerY / DESK_SIZE).toBeGreaterThan(0);
    expect(centerY / DESK_SIZE).toBeLessThan(1);
  });
});

describe("studentLabel", () => {
  it("defaults to full name (firstName + lastName)", () => {
    expect(studentLabel({ firstName: "Ada", lastName: "Lovelace" })).toBe(
      "Ada Lovelace",
    );
  });

  it("prefers the roster's own pre-joined name when there's no split", () => {
    expect(studentLabel({ name: "Ada Lovelace" })).toBe("Ada Lovelace");
  });

  it('nameDisplay "firstName": just the first name, when available', () => {
    expect(
      studentLabel({ firstName: "Ada", lastName: "Lovelace" }, "firstName"),
    ).toBe("Ada");
  });

  it('nameDisplay "lastName": just the last name, when available', () => {
    expect(
      studentLabel({ firstName: "Ada", lastName: "Lovelace" }, "lastName"),
    ).toBe("Lovelace");
  });

  it('nameDisplay "firstName" falls back to the full name when there is no split (only `.name`)', () => {
    expect(studentLabel({ name: "Ada Lovelace" }, "firstName")).toBe(
      "Ada Lovelace",
    );
  });

  it("empty string for no student", () => {
    expect(studentLabel(null)).toBe("");
  });
});

describe("rectsOverlap", () => {
  const rect = (left, top, right, bottom) => ({ left, top, right, bottom });

  it("true for two overlapping rects", () => {
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(5, 5, 15, 15))).toBe(true);
  });

  it("false for two separate rects (gap on the x axis)", () => {
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(11, 0, 20, 10))).toBe(false);
  });

  it("false for two separate rects (gap on the y axis)", () => {
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(0, 11, 10, 20))).toBe(false);
  });

  it("false for two rects that only touch edge-to-edge (no real overlap)", () => {
    expect(rectsOverlap(rect(0, 0, 10, 10), rect(10, 0, 20, 10))).toBe(false);
  });
});

// jsdom has no real layout engine — clientWidth/clientHeight are always 0,
// so the real "does this actually keep cells square" question can only be
// verified in a real browser (done via Playwright against an isolated
// repro of the host app's exact CSS chain, 2026-08-29 — see the module's
// own commit history). Plain objects standing in for the host/grid
// elements let the *arithmetic* be checked directly instead.
function fakeHost(clientWidth, clientHeight) {
  return { clientWidth, clientHeight };
}
function fakeGrid(cols, rows) {
  const props = { "--cll-cols": String(cols), "--cll-rows": String(rows) };
  return {
    style: {
      getPropertyValue: (name) => props[name] ?? "",
      width: "",
      height: "",
    },
  };
}

describe("fitGridToHost", () => {
  it("width-scarce host: cell size follows width, height shrinks to match", () => {
    const host = fakeHost(500, 1200);
    const grid = fakeGrid(5, 6);
    fitGridToHost(host, grid);
    expect(grid.style.width).toBe("500px"); // cellSize = 500/5 = 100
    expect(grid.style.height).toBe("600px"); // 100 * 6 rows
  });

  it("height-scarce host: cell size follows height, width shrinks to match", () => {
    const host = fakeHost(1600, 500);
    const grid = fakeGrid(5, 6);
    fitGridToHost(host, grid);
    const cellSize = 500 / 6; // the scarcer of 1600/5 and 500/6
    expect(grid.style.width).toBe(`${cellSize * 5}px`);
    expect(grid.style.height).toBe("500px");
  });

  it("keeps cells perfectly square regardless of which axis is scarce", () => {
    for (const [w, h] of [
      [500, 1200],
      [1600, 500],
      [900, 700],
    ]) {
      const grid = fakeGrid(5, 6);
      fitGridToHost(fakeHost(w, h), grid);
      const width = parseFloat(grid.style.width);
      const height = parseFloat(grid.style.height);
      expect(width / 5).toBeCloseTo(height / 6, 6); // cellWidth === cellHeight
    }
  });

  it("no-ops when the host has no measured size yet (0×0, not yet laid out)", () => {
    const host = fakeHost(0, 0);
    const grid = fakeGrid(5, 6);
    fitGridToHost(host, grid);
    expect(grid.style.width).toBe("");
    expect(grid.style.height).toBe("");
  });
});
