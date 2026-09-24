import { type Dispatch, type SetStateAction } from "react"

import type { CalculatorSettings, LayoutMode, PathId } from "../../application/contracts"
import { martialArtDefinitions, weaponFamilyNames } from "../../application/gameData/martialArts"
import { productionWeaponIds, typedPathDefinitions } from "../../application/gameData/paths"
import { gameText, t } from "../../i18n"
import { type WeaponId } from "../../types"
import { NumberInput } from "../../ui/NumberInput"
import { Panel } from "../../ui/Panel"

export function SettingsTab({
  settings,
  pathId,
  devMode,
  layoutMode,
  onSettingsChange,
  onLayoutChange,
}: {
  settings: CalculatorSettings
  pathId: PathId
  devMode: boolean
  layoutMode: LayoutMode
  onSettingsChange: Dispatch<SetStateAction<CalculatorSettings>>
  onLayoutChange: (layout: LayoutMode) => void
}) {
  const weaponsLocked = Boolean(typedPathDefinitions[pathId].lockedWeapons)

  return (
    <Panel className="settings-panel">
      <div className="settings-fields">
        <div className="settings-weapon-row">
          {settings.weapons.map((weapon, index) => (
            <label className="editor-field" key={index}>
              <span>{index === 0 ? t("system.gearSlot.leftWeapon") : t("system.gearSlot.rightWeapon")}</span>
              <select
                value={weapon}
                disabled={weaponsLocked}
                onChange={event =>
                  onSettingsChange(current => {
                    const nextWeapon = event.target.value as WeaponId
                    const otherWeapon = current.weapons[index === 0 ? 1 : 0]
                    if (pathId === "mixed" && nextWeapon === otherWeapon) return current
                    const weapons: [WeaponId, WeaponId] = [...current.weapons] as [WeaponId, WeaponId]
                    weapons[index] = nextWeapon
                    return { ...current, weapons }
                  })
                }
              >
                {Object.entries(martialArtDefinitions)
                  .filter(([value]) => devMode || productionWeaponIds.has(value as WeaponId))
                  .map(([value, definition]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={pathId === "mixed" && value === settings.weapons[index === 0 ? 1 : 0]}
                    >
                      {gameText(definition.name)} ({gameText(weaponFamilyNames[definition.weapon])})
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <label className="editor-field ping-field">
          <span>{t("ui.app.ping")}</span>
          <NumberInput
            value={settings.ping}
            min={0}
            max={999}
            step={1}
            inputMode="numeric"
            onCommit={ping => onSettingsChange(current => ({ ...current, ping: ping ?? 0 }))}
          />
        </label>
        <div className="settings-layout-row">
          <label className="editor-field">
            <span>{t("ui.app.layout")}</span>
            <select
              value={layoutMode}
              disabled={!devMode}
              onChange={event => onLayoutChange(event.target.value as LayoutMode)}
            >
              <option value="pc">{t("ui.app.pc")}</option>
              <option value="mobile">{t("ui.app.mobile")}</option>
            </select>
          </label>
        </div>
      </div>
    </Panel>
  )
}
