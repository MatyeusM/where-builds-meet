import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Ported from script/probe/check-preset-eligibility.mjs.
describe("preset-eligibility", () => {
  it("Preset eligibility consistency checks passed", async () => {
    const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
    const collectJsonFiles = async (root) => {
      const files = [];
      const pending = [root];
      while (pending.length) {
        const directory = pending.pop();
        for (const entry of await readdir(directory, { withFileTypes: true })) {
          const entryPath = path.join(directory, entry.name);
          if (entry.isDirectory()) pending.push(entryPath);
          else if (entry.name.endsWith(".json")) files.push(entryPath);
        }
      }
      return files;
    };
    const assertUniqueMartialArts = (definition, file) => {
      expect(
        Array.isArray(definition.martialArts) && definition.martialArts.length >= 2,
        `${file} must declare at least two eligible martial arts.`,
      ).toBeTruthy();
      expect(
        new Set(definition.martialArts).size === definition.martialArts.length,
        `${file} must not repeat martial-art eligibility entries.`,
      ).toBeTruthy();
    };

    const paths = await readJson("data/path.json");
    const statCaps = await readJson("data/stat.json");
    const gearData = await readJson("data/gear.json");
    const lockedMartialArts = new Set();
    const allowedStatuses = new Set(["available", "wip", "devOnly", "plannerOnly"]);
    const pathByBuildGroup = new Map();
    for (const [pathId, definition] of Object.entries(paths)) {
      expect(allowedStatuses.has(definition.status), `Path ${pathId} must declare a recognized status.`).toBeTruthy();
      expect(
        typeof definition.buildGroup === "string" && definition.buildGroup,
        `Path ${pathId} must declare a build group.`,
      ).toBeTruthy();
      expect(
        !pathByBuildGroup.has(definition.buildGroup),
        `Build group ${definition.buildGroup} is assigned to multiple paths.`,
      ).toBeTruthy();
      pathByBuildGroup.set(definition.buildGroup, { pathId, definition });
      if (!definition.lockedWeapons) continue;
      expect(
        definition.lockedWeapons.length >= 2 &&
          new Set(definition.lockedWeapons).size === definition.lockedWeapons.length,
        `Path ${pathId} must declare at least two distinct locked martial arts.`,
      ).toBeTruthy();
      definition.lockedWeapons.forEach((martialArt) => lockedMartialArts.add(martialArt));
    }

    const buildFiles = await collectJsonFiles("data/build");
    const rotationFiles = await collectJsonFiles("data/rotation");
    const presetMartialArts = new Set();
    const buildPresetIds = new Set();
    const buildsById = new Map();
    const rotationsById = new Map();
    for (const file of [...buildFiles, ...rotationFiles]) {
      const definition = await readJson(file);
      assertUniqueMartialArts(definition, file);
      definition.martialArts.forEach((martialArt) => presetMartialArts.add(martialArt));
      if (file.startsWith(`data${path.sep}build${path.sep}`)) {
        expect(!buildPresetIds.has(definition.id), `Build preset ID ${definition.id} must be unique.`).toBeTruthy();
        buildPresetIds.add(definition.id);
        const relative = path.relative("data/build", file).split(path.sep);
        const buildGroup = relative.length > 1 ? relative[0] : undefined;
        buildsById.set(definition.id, { definition, file, buildGroup });
        if (!buildGroup) continue;
        const pathEntry = pathByBuildGroup.get(buildGroup);
        expect(pathEntry, `Build group ${buildGroup} must be assigned to a path.`).toBeTruthy();
        if (!pathEntry.definition.lockedWeapons) continue;
        expect(
          [...definition.martialArts].sort().join("|") === [...pathEntry.definition.lockedWeapons].sort().join("|"),
          `${file} must use the martial-art pair locked by path ${pathEntry.pathId}.`,
        ).toBeTruthy();
        continue;
      }
      const rotationId = path.basename(file, ".json");
      expect(!rotationsById.has(rotationId), `Rotation preset ID ${rotationId} must be unique.`).toBeTruthy();
      rotationsById.set(rotationId, { definition, file });
    }

    for (const [pathId, definition] of Object.entries(paths)) {
      expect(typeof definition.defaultBuild === "string", `Path ${pathId} must declare a default build.`).toBeTruthy();
      expect(typeof definition.graduated === "string", `Path ${pathId} must declare a graduate build.`).toBeTruthy();
      expect(
        typeof definition.defaultRotation === "string",
        `Path ${pathId} must declare a default rotation.`,
      ).toBeTruthy();
      const defaultBuildId = definition.defaultBuild;
      const graduateBuildId = definition.graduated;
      const defaultRotationId = definition.defaultRotation;
      const build = buildsById.get(defaultBuildId);
      const graduateBuild = buildsById.get(graduateBuildId);
      const rotation = rotationsById.get(defaultRotationId);
      expect(build, `Path ${pathId} references missing default build ${defaultBuildId}.`).toBeTruthy();
      expect(graduateBuild, `Path ${pathId} references missing graduate build ${graduateBuildId}.`).toBeTruthy();
      expect(rotation, `Path ${pathId} references missing default rotation ${defaultRotationId}.`).toBeTruthy();
      if (definition.defaultBuild !== "empty")
        expect(
          build.buildGroup === definition.buildGroup,
          `Path ${pathId}'s default build must belong to its build group.`,
        ).toBeTruthy();
      if (definition.graduated !== "empty")
        expect(
          graduateBuild.buildGroup === definition.buildGroup,
          `Path ${pathId}'s graduate build must belong to its build group.`,
        ).toBeTruthy();
      if (definition.graduated !== "empty") {
        expect(
          graduateBuild.definition.relayed !== true,
          `Path ${pathId}'s graduate build cannot be relayed.`,
        ).toBeTruthy();
        for (const [slot, gear] of Object.entries(graduateBuild.definition.gear ?? {})) {
          expect(gear.relayed !== true, `Path ${pathId}'s graduate ${slot} cannot be relayed.`).toBeTruthy();
          const affixCaps = statCaps[String(gear.level)]?.affix;
          expect(affixCaps, `Path ${pathId}'s graduate ${slot} has unsupported gear level ${gear.level}.`).toBeTruthy();
          const gearDefinition = gearData.gear[gear.definitionId];
          expect(
            gearDefinition?.slots.includes(slot),
            `Path ${pathId}'s graduate ${slot} uses an invalid gear definition.`,
          ).toBeTruthy();
          const allowedAffixes = (category) => {
            const options = gearDefinition[category];
            const relayOnly = new Set(options[`${gear.level}Relayed`] ?? []);
            const standard = (options[String(gear.level)] ?? []).filter((key) => !relayOnly.has(key));
            const universal =
              category === "additionalAffixes" ? (gearData.universalAdditionalAffixes[String(gear.level)] ?? []) : [];
            return new Set([...standard, ...universal]);
          };
          expect(
            allowedAffixes("baseAffixes").has(gear.baseAffix.key),
            `Path ${pathId}'s graduate ${slot} uses an invalid base affix ${gear.baseAffix.key}.`,
          ).toBeTruthy();
          const additionalKeys = gear.additionalAffixes?.map((affix) => affix.key) ?? [];
          expect(
            additionalKeys.length === 4 && new Set(additionalKeys).size === 4,
            `Path ${pathId}'s graduate ${slot} must use four distinct additional affixes.`,
          ).toBeTruthy();
          for (const key of additionalKeys)
            expect(
              allowedAffixes("additionalAffixes").has(key),
              `Path ${pathId}'s graduate ${slot} uses invalid additional affix ${key}.`,
            ).toBeTruthy();
          for (const affix of [gear.baseAffix, ...(gear.additionalAffixes ?? [])]) {
            const maximum = affixCaps[affix.key];
            expect(
              maximum !== undefined,
              `Path ${pathId}'s graduate ${slot} uses unsupported affix ${affix.key}.`,
            ).toBeTruthy();
            expect(
              affix.value === maximum,
              `Path ${pathId}'s graduate ${slot} affix ${affix.key} must use its maximum roll.`,
            ).toBeTruthy();
          }
        }
      }
      if (definition.lockedWeapons && definition.defaultRotation !== "empty")
        expect(
          [...rotation.definition.martialArts].sort().join("|") === [...definition.lockedWeapons].sort().join("|"),
          `Path ${pathId}'s default rotation must use its locked martial-art pair.`,
        ).toBeTruthy();
      if (definition.status === "available") {
        expect(
          build.definition.test !== true,
          `Available path ${pathId} cannot use a test-only default build.`,
        ).toBeTruthy();
        expect(
          graduateBuild.definition.test !== true,
          `Available path ${pathId} cannot use a test-only graduate build.`,
        ).toBeTruthy();
        expect(
          rotation.definition.test !== true,
          `Available path ${pathId} cannot use a test-only default rotation.`,
        ).toBeTruthy();
      }
    }

    for (const martialArt of lockedMartialArts) {
      expect(
        presetMartialArts.has(martialArt),
        `Locked martial art ${martialArt} must be represented by a build or rotation preset.`,
      ).toBeTruthy();
    }
  });
});
