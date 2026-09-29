import fs from "node:fs"
import path from "node:path"

import { assert, describe, it } from "vitest"

// Ported from script/probe/check-triggered-skills.mjs.
describe("triggered-skills", () => {
  it("triggered-skills checks", async () => {
    const jsonFiles = directory =>
      fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
        const itemPath = path.join(directory, entry.name)
        if (entry.isDirectory()) return jsonFiles(itemPath)
        return entry.name.endsWith(".json") ? [itemPath] : []
      })
    const walk = (value, visit) => {
      if (Array.isArray(value)) value.forEach(item => walk(item, visit))
      else if (value && typeof value === "object") {
        visit(value)
        Object.values(value).forEach(item => walk(item, visit))
      }
    }
    // A preview may introduce the triggered skill a previewed trigger names, so a preview's
    // own `skill` folder defines records exactly as the shipped folder does. Both are merged,
    // and because a preview's triggers are walked below, a preview-only `Triggered` record is
    // still required to be referenced.
    const skillDefinitionFiles = [
      ...jsonFiles(path.join("data", "skill")),
      ...jsonFiles(path.join("data", "preview")).filter(file => path.basename(path.dirname(file)) === "skill"),
    ]
    const definitions = Object.assign(
      {},
      ...skillDefinitionFiles.map(file => JSON.parse(fs.readFileSync(file, "utf8"))),
    )
    const triggeredIds = new Set()

    jsonFiles("data").forEach(file =>
      walk(JSON.parse(fs.readFileSync(file, "utf8")), value => {
        if (value.attackResponse?.durationFrom)
          assert(
            definitions[value.attackResponse.durationFrom] !== undefined,
            "Attack response duration reference must resolve",
          )
        if (typeof value.attackResponse?.onSuccess === "string") triggeredIds.add(value.attackResponse.onSuccess)
        if (typeof value.onMaxStack?.trigger === "string") triggeredIds.add(value.onMaxStack.trigger)
        if (value.type !== "trigger") return
        if (typeof value.value === "string") {
          triggeredIds.add(value.value)
          return
        }
        if (value.value?.function !== "switch" || !value.value.param2 || typeof value.value.param2 !== "object") return
        Object.values(value.value.param2).forEach(skillId => {
          if (typeof skillId === "string") triggeredIds.add(skillId)
        })
        if (typeof value.value.fallback === "string") triggeredIds.add(value.value.fallback)
      }),
    )

    triggeredIds.forEach(skillId => {
      assert(definitions[skillId], `Triggered skill ${skillId} has no skill definition.`)
      assert(
        definitions[skillId].tags?.includes("Triggered"),
        `Triggered skill ${skillId} is missing the Triggered tag.`,
      )
    })
    Object.entries(definitions).forEach(([skillId, definition]) => {
      if (definition.tags?.includes("Triggered"))
        assert(triggeredIds.has(skillId), `${skillId} is tagged Triggered but is not referenced by a trigger action.`)
    })
  })
})
