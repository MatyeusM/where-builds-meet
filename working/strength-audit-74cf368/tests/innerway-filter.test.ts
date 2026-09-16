import { describe, expect, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";

// Ported from script/probe/check-innerway-filter.mjs.
describe("innerway-filter", () => {
  it("Inner Way filter behavior checks passed", async () => {
    const { innerWayDefinitions, innerWayEntriesForTag } = await probeLoad("/src/data/innerWayDefinitions.ts");
    const allTags = new Set(Object.values(innerWayDefinitions).flatMap((definition) => definition.tags ?? []));

    for (const tag of allTags) {
      const filtered = innerWayEntriesForTag(tag);
      expect(filtered.length > 0, `The ${tag} filter must return at least one Inner Way.`).toBeTruthy();
      expect(
        filtered.every(([, definition]) => definition.tags?.includes(tag)),
        `The ${tag} filter returned an Inner Way without that tag.`,
      ).toBeTruthy();
      for (const [id, definition] of Object.entries(innerWayDefinitions)) {
        if (!definition.tags?.includes(tag)) continue;
        expect(
          filtered.some(([filteredId]) => filteredId === id),
          `The ${tag} filter omitted eligible Inner Way ${id}.`,
        ).toBeTruthy();
      }
    }

    expect(
      innerWayEntriesForTag("__unknown_path_tag__").length === 0,
      "An unknown tag must return no Inner Ways.",
    ).toBeTruthy();
  });
});
