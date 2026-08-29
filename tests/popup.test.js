import { describe, it, expect, afterEach } from "vitest";
import { openFloating, closeFloating } from "../src/popup.js";

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
