import everspringMartialArt from "../../../data/martial-art/everspring-umbrella.json"
import heavenquakerSpearMartialArt from "../../../data/martial-art/heavenquaker-spear.json"
import heavenwillMartialArt from "../../../data/martial-art/heavenwill-gauntlets.json"
import infernalTwinbladesMartialArt from "../../../data/martial-art/infernal-twinblades.json"
import inkwellFanMartialArt from "../../../data/martial-art/inkwell-fan.json"
import mortalRopeDartMartialArt from "../../../data/martial-art/mortal-rope-dart.json"
import namelessSpearMartialArt from "../../../data/martial-art/nameless-spear.json"
import namelessSwordMartialArt from "../../../data/martial-art/nameless-sword.json"
import panaceaFanMartialArt from "../../../data/martial-art/panacea-fan.json"
import phalanxbaneMartialArt from "../../../data/martial-art/phalanxbane-blade.json"
import rivenTwinbladesMartialArt from "../../../data/martial-art/riven-twinblades.json"
import skygraspMartialArt from "../../../data/martial-art/skygrasp-rope-dart.json"
import skystrikeGauntletsMartialArt from "../../../data/martial-art/skystrike-gauntlets.json"
import snowpartingMartialArt from "../../../data/martial-art/snowparting-blade.json"
import soulshadeUmbrellaMartialArt from "../../../data/martial-art/soulshade-umbrella.json"
import stormbreakerMartialArt from "../../../data/martial-art/stormbreaker-spear.json"
import strategicSwordMartialArt from "../../../data/martial-art/strategic-sword.json"
import thundercryMartialArt from "../../../data/martial-art/thundercry-blade.json"
import unfetteredMartialArt from "../../../data/martial-art/unfettered-rope-dart.json"
import vernalUmbrellaMartialArt from "../../../data/martial-art/vernal-umbrella.json"
import type { MartialArtTalent } from "../../data/martialArtTalents"
import type { WeaponFamily, WeaponId, CharacterStats } from "../../types"
import { weaponIds as allWeaponIds } from "../../types"
import type { SetupEffect } from "./setup"

export type MartialArtDefinition = {
  name: string
  weapon: WeaponFamily
  tag: string
  talent: MartialArtTalent<SetupEffect>[][]
}
export const martialArtDefinitions: Record<WeaponId, MartialArtDefinition> = {
  snowparting: snowpartingMartialArt as MartialArtDefinition,
  phalanxbane: phalanxbaneMartialArt as MartialArtDefinition,
  thundercry: thundercryMartialArt as MartialArtDefinition,
  stormbreaker: stormbreakerMartialArt as MartialArtDefinition,
  everspring: everspringMartialArt as MartialArtDefinition,
  unfettered: unfetteredMartialArt as MartialArtDefinition,
  heavenwill: heavenwillMartialArt as MartialArtDefinition,
  skygrasp: skygraspMartialArt as MartialArtDefinition,
  namelessSword: namelessSwordMartialArt as MartialArtDefinition,
  namelessSpear: namelessSpearMartialArt as MartialArtDefinition,
  strategicSword: strategicSwordMartialArt as MartialArtDefinition,
  heavenquakerSpear: heavenquakerSpearMartialArt as MartialArtDefinition,
  vernalUmbrella: vernalUmbrellaMartialArt as MartialArtDefinition,
  inkwellFan: inkwellFanMartialArt as MartialArtDefinition,
  panaceaFan: panaceaFanMartialArt as MartialArtDefinition,
  soulshadeUmbrella: soulshadeUmbrellaMartialArt as MartialArtDefinition,
  infernalTwinblades: infernalTwinbladesMartialArt as MartialArtDefinition,
  mortalRopeDart: mortalRopeDartMartialArt as MartialArtDefinition,
  skystrikeGauntlets: skystrikeGauntletsMartialArt as MartialArtDefinition,
  rivenTwinblades: rivenTwinbladesMartialArt as MartialArtDefinition,
}
export const weaponFamilyNames: Record<WeaponFamily, string> = {
  HengBlade: "Heng Blade",
  MoBlade: "Mo Blade",
  Spear: "Spear",
  Umbrella: "Umbrella",
  RopeDart: "Rope Dart",
  Gauntlet: "Gauntlet",
  Sword: "Sword",
  Fan: "Fan",
  DualBlades: "Dual Blades",
}
export const weaponIdSet = new Set<WeaponId>(allWeaponIds)
export const isWeaponId = (value: unknown): value is WeaponId =>
  typeof value === "string" && weaponIdSet.has(value as WeaponId)

export const artStatByWeaponFamily: Record<WeaponFamily, keyof CharacterStats> = {
  HengBlade: "hengBladeDmgBoost",
  MoBlade: "moBladeDmgBoost",
  Spear: "spearDmgBoost",
  Umbrella: "umbrellaDmgBoost",
  RopeDart: "ropeDartDmgBoost",
  Gauntlet: "gauntletDmgBoost",
  Sword: "swordDmgBoost",
  Fan: "fanDmgBoost",
  DualBlades: "dualBladesDmgBoost",
}
