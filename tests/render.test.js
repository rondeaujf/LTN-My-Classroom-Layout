import { describe, it, expect } from "vitest";
import { plateauTopLeftLocal, positionLevelBadge } from "../src/render.js";

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
