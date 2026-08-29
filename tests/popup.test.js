import { describe, it, expect, afterEach } from "vitest";
import {
  openFloating,
  closeFloating,
  clampFloatingPosition,
} from "../src/popup.js";

afterEach(() => {
  closeFloating();
  document.body.replaceChildren();
});

describe("openFloating host resolution", () => {
  it("appends to document.body when there is no enclosing open dialog", () => {
    const { close } = openFloating(10, 10, "cll-test", (panel) => {
      panel.textContent = "hi";
    });
    const panel = document.querySelector(".cll-test");
    expect(panel.parentElement).toBe(document.body);
    close();
  });

  it("appends inside the closest open <dialog> instead, when the anchor is inside one", () => {
    // A host app's own modal dialog (e.g. letableaunoir's createDialog):
    // native <dialog open> promotes its content to the browser's top layer,
    // which paints above (and makes inert) anything appended to
    // document.body — so a floating panel must live inside it too.
    const dialog = document.createElement("dialog");
    dialog.setAttribute("open", "");
    const anchor = document.createElement("div");
    dialog.appendChild(anchor);
    document.body.appendChild(dialog);

    const { close } = openFloating(
      10,
      10,
      "cll-test",
      (panel) => {
        panel.textContent = "hi";
      },
      anchor,
    );
    const panel = document.querySelector(".cll-test");
    expect(panel.parentElement).toBe(dialog);
    expect(panel.parentElement).not.toBe(document.body);
    close();
  });

  it("falls back to document.body when the dialog isn't open", () => {
    const dialog = document.createElement("dialog"); // no "open" attribute
    const anchor = document.createElement("div");
    dialog.appendChild(anchor);
    document.body.appendChild(dialog);

    const { close } = openFloating(
      10,
      10,
      "cll-test",
      (panel) => {
        panel.textContent = "hi";
      },
      anchor,
    );
    const panel = document.querySelector(".cll-test");
    expect(panel.parentElement).toBe(document.body);
    close();
  });
});

// jsdom has no real layout engine — getBoundingClientRect always returns an
// all-zero rect, so openFloating's own overflow check can never actually be
// exercised through the DOM (see clampFloatingPosition, src/popup.js).
// Plain numbers standing in for the rects/bounds it would otherwise read.
describe("clampFloatingPosition", () => {
  it("leaves the position alone when it fits", () => {
    expect(
      clampFloatingPosition({
        left: 10,
        top: 10,
        rectRight: 110,
        rectBottom: 60,
        panelWidth: 100,
        panelHeight: 50,
        boundRight: 400,
        boundBottom: 300,
      }),
    ).toEqual({ left: 10, top: 10 });
  });

  it("flips left past the click point to clear a right overflow", () => {
    // A host box only 150px wide, panel 100px wide, opened at x=120 —
    // overflows the right edge (120+100=220 > 150).
    expect(
      clampFloatingPosition({
        left: 120,
        top: 10,
        rectRight: 220,
        rectBottom: 60,
        panelWidth: 100,
        panelHeight: 50,
        boundRight: 150,
        boundBottom: 300,
      }),
    ).toEqual({ left: 20, top: 10 }); // 120 - 100
  });

  it("clamps to 0 when flipping would still overflow the left edge (panel wider than the host)", () => {
    // Host only 80px wide — a 100px-wide panel can never fully fit; flipping
    // from left=50 would land at -50, clamped to 0 instead of going negative
    // (which would just overflow the *other* edge, off past the host too).
    expect(
      clampFloatingPosition({
        left: 50,
        top: 10,
        rectRight: 150,
        rectBottom: 60,
        panelWidth: 100,
        panelHeight: 50,
        boundRight: 80,
        boundBottom: 300,
      }),
    ).toEqual({ left: 0, top: 10 });
  });

  it("clamps the bottom the same way, independently of the right/left clamp", () => {
    expect(
      clampFloatingPosition({
        left: 10,
        top: 250,
        rectRight: 110,
        rectBottom: 300,
        panelWidth: 100,
        panelHeight: 50,
        boundRight: 400,
        boundBottom: 260,
      }),
    ).toEqual({ left: 10, top: 200 }); // 250 - 50
  });
});
