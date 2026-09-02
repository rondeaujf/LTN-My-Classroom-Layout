import { describe, it, expect, beforeEach } from "vitest";
import { ClassroomLayout } from "../src/index.js";
import {
  makeT,
  normalizeLocale,
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
} from "../src/i18n.js";
import { buildPrintSheet } from "../src/print.js";

global.ResizeObserver ??= class {
  observe() {}
  disconnect() {}
};

function contextMenu(el) {
  el.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true }),
  );
}

describe("i18n helpers", () => {
  it("normalizeLocale: strips region, defaults to fr", () => {
    expect(normalizeLocale("en-GB")).toBe("en");
    expect(normalizeLocale("DE")).toBe("de");
    expect(normalizeLocale("pt-BR")).toBe(DEFAULT_LOCALE);
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE);
  });

  it("makeT: falls back to French then to the key", () => {
    const t = makeT("en");
    expect(t("deskAdd")).toBe("Add a desk");
    // unknown key -> returned as-is
    expect(t("__nope__")).toBe("__nope__");
  });

  it("makeT: interpolates {size} in the table prompts", () => {
    expect(makeT("en")("tablePromptOval", { size: "2×3" })).toBe(
      "Create an oval table (2×3)",
    );
  });

  it("every locale resolves a real string for the shared keys", () => {
    const keys = [
      "deskAdd",
      "studentAssign",
      "settingsToggle",
      "orientationLandscape",
      "borderMur",
      "colorApply",
      "printTeacherBlank",
    ];
    for (const loc of SUPPORTED_LOCALES) {
      const t = makeT(loc);
      for (const k of keys) {
        expect(typeof t(k)).toBe("string");
        expect(t(k).length).toBeGreaterThan(0);
      }
    }
  });
});

describe("ClassroomLayout locale option", () => {
  let container;
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
  });

  it("defaults to French toolbar labels (no behaviour change)", async () => {
    const layout = new ClassroomLayout(container);
    await layout.ready;
    expect(container.querySelector(".cll-settings-toggle").textContent).toMatch(
      /Paramètres/,
    );
  });

  it("localizes the toolbar when locale is set", async () => {
    const layout = new ClassroomLayout(container, { locale: "en" });
    await layout.ready;
    expect(container.querySelector(".cll-settings-toggle").textContent).toMatch(
      /Settings/,
    );
    expect(
      container.querySelector(".cll-toolbar button:last-child").textContent,
    ).toBe("Print / PDF export");
  });

  it("localizes the cell context menu", async () => {
    const layout = new ClassroomLayout(container, { locale: "de" });
    await layout.ready;
    contextMenu(container.querySelector(".cll-cell"));
    const labels = [...document.querySelectorAll(".cll-menu-item-label")].map(
      (n) => n.textContent,
    );
    expect(labels).toContain("Tisch hinzufügen");
  });
});

describe("buildPrintSheet locale", () => {
  it("uses the localized blank teacher/school lines", () => {
    const state = {
      version: 1,
      grid: { cols: 2, rows: 2 },
      cells: {},
      edges: {},
    };
    const sheet = buildPrintSheet(state, {
      editableTeacherInputs: true,
      locale: "en",
    });
    expect(sheet.querySelector(".cll-print-school").textContent).toBe(
      "School: _______________",
    );
  });
});
