import { describe, expect, it } from "vitest";

// Ported from script/probe/check-build-setup-defaults.mjs.
describe("build-setup-defaults", () => {
  it("Build-sourced setup defaults and one-time legacy migration checks passed", async () => {
    const createStorage = () => {
      const values = new Map();
      return {
        values,
        get length() {
          return values.size;
        },
        getItem: (key) => values.get(key) ?? null,
        key: (index) => [...values.keys()][index] ?? null,
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: (key) => values.delete(key),
        clear: () => values.clear(),
      };
    };
    const localStorage = createStorage();
    const sessionStorage = createStorage();
    globalThis.window = { localStorage, sessionStorage };
    globalThis.localStorage = localStorage;
    globalThis.sessionStorage = sessionStorage;

    try {
      const { loadBuildSetupOverrides } = await import("../src/App.tsx");
      const { defaultBuildSetup } = await import("../src/gear.ts");
      const legacyInnerWays = [
        { innerWay: "BreakingPoint", tier: "T3" },
        { innerWay: "MoraleChant", tier: "T6" },
        { innerWay: "SteadfastDevotion", tier: "T6" },
        { innerWay: "ThroatPiercingArt", tier: "T6" },
      ];

      sessionStorage.setItem("wwm-build-setup-overrides-v1", "{}");
      sessionStorage.setItem("wwm-inner-way-session-v1", JSON.stringify(legacyInnerWays));
      const current = loadBuildSetupOverrides(defaultBuildSetup);
      expect(
        Object.keys(current).length === 0,
        "An explicitly saved empty override must use every setup value from the active build.",
      ).toBeTruthy();

      localStorage.removeItem("wwm-build-setup-overrides-v1");
      const migrated = loadBuildSetupOverrides(defaultBuildSetup);
      expect(
        migrated.innerWays?.[0]?.innerWay === "BreakingPoint",
        "The standalone Inner Way session must migrate only when the unified override has never been saved.",
      ).toBeTruthy();
    } finally {
      delete globalThis.window;
      delete globalThis.localStorage;
      delete globalThis.sessionStorage;
    }
  });
});
