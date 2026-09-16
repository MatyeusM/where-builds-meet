import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Ported from script/probe/check-triggered-skills.mjs.
describe("triggered-skills", () => {
  it("triggered-skills checks", async () => {
    const jsonFiles = (directory) =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
        const itemPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return jsonFiles(itemPath);
        return entry.name.endsWith(".json") ? [itemPath] : [];
      });
    const walk = (value, visit) => {
      if (Array.isArray(value)) value.forEach((item) => walk(item, visit));
      else if (value && typeof value === "object") {
        visit(value);
        Object.values(value).forEach((item) => walk(item, visit));
      }
    };
    const definitions = Object.assign(
      {},
      ...jsonFiles(path.join("data", "skill")).map((file) => JSON.parse(fs.readFileSync(file, "utf8"))),
    );
    const triggeredIds = new Set();

    jsonFiles("data").forEach((file) =>
      walk(JSON.parse(fs.readFileSync(file, "utf8")), (value) => {
        if (value.attackResponse?.durationFrom)
          expect(
            definitions[value.attackResponse.durationFrom],
            "Attack response duration reference must resolve",
          ).toBeDefined();
        if (typeof value.attackResponse?.onSuccess === "string") triggeredIds.add(value.attackResponse.onSuccess);
        if (value.type !== "trigger") return;
        if (typeof value.value === "string") {
          triggeredIds.add(value.value);
          return;
        }
        if (value.value?.function !== "switch" || !value.value.param2 || typeof value.value.param2 !== "object") return;
        Object.values(value.value.param2).forEach((skillId) => {
          if (typeof skillId === "string") triggeredIds.add(skillId);
        });
        if (typeof value.value.fallback === "string") triggeredIds.add(value.value.fallback);
      }),
    );

    triggeredIds.forEach((skillId) => {
      expect(definitions[skillId], `Triggered skill ${skillId} has no skill definition.`).toBeTruthy();
      expect(
        definitions[skillId].tags?.includes("Triggered"),
        `Triggered skill ${skillId} is missing the Triggered tag.`,
      ).toBeTruthy();
    });
    Object.entries(definitions).forEach(([skillId, definition]) => {
      if (definition.tags?.includes("Triggered"))
        expect(
          triggeredIds.has(skillId),
          `${skillId} is tagged Triggered but is not referenced by a trigger action.`,
        ).toBeTruthy();
    });
  });
});
