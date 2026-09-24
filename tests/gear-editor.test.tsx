// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { GearEditor, newDraft } from "../src/components/GearEditor"
import { affixOptionsForGearDefinition, attunementsForGearDefinition, gearData } from "../src/gear"

describe("GearEditor", () => {
  type GearEditorProps = Parameters<typeof GearEditor>[0]
  let container: HTMLDivElement
  let root: Root

  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
  })

  it("marks only the required empty affix value as invalid", async () => {
    const [definitionId, definition] = Object.entries(gearData.gear)[0]
    const draft = newDraft()

    await act(async () => {
      root.render(
        <GearEditor
          definition={definition}
          definitionId={definitionId}
          definitionName={definition.name}
          editingExisting={false}
          draft={draft}
          error=""
          baseAffixOptions={affixOptionsForGearDefinition(definition, "baseAffixes", draft.level)}
          additionalAffixOptions={affixOptionsForGearDefinition(definition, "additionalAffixes", draft.level)}
          attunementOptions={attunementsForGearDefinition(definition)}
          selectedAdditionalKeys={new Set()}
          onDraftChange={vi.fn<GearEditorProps["onDraftChange"]>()}
          onLevelChange={vi.fn<GearEditorProps["onLevelChange"]>()}
          onRelayedChange={vi.fn<GearEditorProps["onRelayedChange"]>()}
          onCancel={vi.fn<GearEditorProps["onCancel"]>()}
          onSave={vi.fn<GearEditorProps["onSave"]>()}
        />,
      )
    })

    const inputs = Array.from(container.querySelectorAll('input[type="number"]'))
    expect(inputs).toHaveLength(6)
    expect(inputs[0]?.getAttribute("aria-invalid")).toBe("true")
    expect(inputs.slice(1).every(input => !input.hasAttribute("aria-invalid"))).toBe(true)
  })
})
