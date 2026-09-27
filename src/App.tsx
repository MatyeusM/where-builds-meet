import { IconBrandDiscord, IconBrandGithub } from "@tabler/icons-react"
import { lazy, Suspense, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react"

import { resolveBuildStatState } from "./application/buildStatState"
import { settingsForPath } from "./application/characterComposition"
import type { CalculatorSettings, LayoutMode, PathId, SetupSelections } from "./application/contracts"
import { martialArtDefinitions } from "./application/gameData/martialArts"
import { pathIcons } from "./application/gameData/pathIcons"
import {
  defaultBuildIdForPath,
  defaultRotationIdForPath,
  pathRequiresDev,
  pathStatusLabel,
  typedPathDefinitions,
  type PathDefinition,
} from "./application/gameData/paths"
import { breakthroughProfile } from "./application/gameData/setup"
import { loadAttunementOverrides } from "./application/persistence/attunements"
import { loadRotationEntries } from "./application/persistence/rotations"
import { loadSettings } from "./application/persistence/settings"
import { loadBuildSetupOverrides, sameBuildSetupValue } from "./application/persistence/setupOverrides"
import { hasSkillOverrides, loadSkillOverrides } from "./application/persistence/skillOverrides"
import { loadStatOverrides } from "./application/persistence/stats"
import { rotationAvailableForWeapons } from "./application/rotationCatalog"
import { FeatureLoadBoundary } from "./application/shell/FeatureLoadBoundary"
import { NoticeArea } from "./application/shell/NoticeArea"
import type { AttunementOverrides } from "./calculations/attunementStats"
import { type AttunementStats } from "./calculations/damage"
import { BreakdownTab } from "./features/analysis/BreakdownTab"
import { StatsTab } from "./features/character/StatsTab"
import { SettingsTab } from "./features/settings/SettingsTab"
import { SkillEditorTab } from "./features/skills/SkillEditorTab"
import { loadGlobalDebuffs } from "./globalDebuffs"
import { Button } from "./ui/Button"
import { Chip } from "./ui/Chip"
import { Tab } from "./ui/Tab"
const loadBuildTab = () => import("./features/build/BuildTab")
const loadSimulationTab = () => import("./features/simulation/SimulationTab")
const loadRotationEditorTab = () => import("./features/rotations/RotationEditorTab")
const BuildTab = lazy(loadBuildTab)
const SimulationTab = lazy(loadSimulationTab)
const RotationEditorTab = lazy(() => loadRotationEditorTab().then(module => ({ default: module.RotationEditorTab })))
import {
  activeBuildByPathStorageKey,
  attunementOverrideStorageKey,
  buildSetupOverrideStorageKey,
  divinecraftStorageKey,
  foodStorageKey,
  layoutPreviewStorageKey,
  pathStorageKey,
  scriptStorageKey,
  settingsStorageKey,
  skillStorageKey,
  statOverrideStorageKey,
} from "./application/persistence/keys"
import { loadPathSelectionIds, withPathSelection, type PathSelectionIds } from "./application/persistence/pathSelection"
import {
  compactLayoutSnapshot,
  loadDevMode,
  loadDivinecraft,
  loadFood,
  loadLayoutPreview,
  loadScript,
  loadSelectedPath,
  subscribeToCompactLayout,
} from "./application/persistence/settings"
import type { CharacterStatOverrides } from "./calculations/statEffects"
import {
  characterProfileStorageKey,
  loadCharacterProfiles,
  serializeCharacterProfiles,
  type CharacterProfile,
} from "./characterProfiles"
import { useActiveRotationResult } from "./features/rotations/useActiveRotationResult"
import {
  activeBuildStorageKey,
  buildEntryAvailableForPath,
  buildEntryIsTestPreset,
  buildListStorageKey,
  loadBuildState,
  resolveBuildSetup,
  sameWeaponPair,
  serializeBuildState,
  type BuildSetup,
  type BuildSetupOverrides,
  type BuildState,
} from "./gear"
import {
  developmentModeStorageKey as devModeStorageKey,
  gameText,
  getLocale,
  getLocaleDisplayName,
  getSupportedLocales,
  isLocaleWip,
  selectLocale,
  t,
} from "./i18n"
import { resolvePathWorkspaceSelection } from "./pathWorkspace"
import { removePersistentItem, setPersistentItem } from "./persistentStorage"
import { serializeSkillOverrides, type SkillOverrides } from "./skillOverrides"
import { useDpsStore } from "./stores/dpsStore"
import { useRotationStore } from "./stores/rotationStore"
import { type CharacterStats, type EnemyProfile, type WeaponId } from "./types"

const tabSuspenseFallback = <div className="viewport-tab-content" />

export default function App() {
  const compactViewport = useSyncExternalStore(subscribeToCompactLayout, compactLayoutSnapshot, () => false)
  const [locale, setLocale] = useState(getLocale)
  const [activeTab, setActiveTab] = useState<
    "main" | "build" | "breakdown" | "rotations" | "simulation" | "skills" | "settings"
  >("main")
  // Mount the simulator only on first use, then keep it mounted while hidden. Its module is preloaded below.
  // Remounting would cancel its worker and discard progress/results on every tab switch.
  const [simulationMounted, setSimulationMounted] = useState(false)
  // The rotation editor is deferred for a different reason: it is the largest module in the
  // application, and it is only needed to read comparisons, which nothing else displays. It is
  // deliberately absent from the idle preload below, which would give back what deferring it
  // saves. The active rotation's own totals are resolved by the application, so the headline
  // number does not wait for it.
  const [rotationsMounted, setRotationsMounted] = useState(false)

  useEffect(() => {
    const preloadDeferredTabs = () => {
      void Promise.allSettled([loadBuildTab(), loadSimulationTab()])
    }
    if (typeof window.requestIdleCallback === "function") {
      const idleCallback = window.requestIdleCallback(preloadDeferredTabs, { timeout: 1500 })
      return () => window.cancelIdleCallback(idleCallback)
    }
    const timeout = window.setTimeout(preloadDeferredTabs, 1)
    return () => window.clearTimeout(timeout)
  }, [])

  const [skillOverrides, setSkillOverrides] = useState<SkillOverrides>(loadSkillOverrides)
  const skillEditorModified = hasSkillOverrides(skillOverrides)
  const [innerWayRevision, setInnerWayRevision] = useState(0)
  const [setupSelections, setSetupSelections] = useState<SetupSelections>(() => ({
    food: loadFood(),
    script: loadScript(),
    divinecraft: loadDivinecraft(),
  }))
  useEffect(() => setPersistentItem(foodStorageKey, setupSelections.food), [setupSelections.food])
  useEffect(() => setPersistentItem(scriptStorageKey, setupSelections.script), [setupSelections.script])
  useEffect(() => setPersistentItem(divinecraftStorageKey, setupSelections.divinecraft), [setupSelections.divinecraft])
  const [statOverrides, setStatOverrides] = useState<CharacterStatOverrides>(loadStatOverrides)
  const [attunementOverrides, setAttunementOverrides] = useState<AttunementOverrides>(loadAttunementOverrides)
  const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>(loadCharacterProfiles)
  const [devMode, setDevMode] = useState(loadDevMode)
  const [layoutPreview, setLayoutPreview] = useState<LayoutMode>(() => loadLayoutPreview(compactViewport))
  const layoutMode: LayoutMode = devMode ? layoutPreview : compactViewport ? "mobile" : "pc"
  const [pathId, setPathId] = useState<PathId>(() => loadSelectedPath(devMode))
  const [settings, setSettings] = useState<CalculatorSettings>(() => settingsForPath(loadSettings(), pathId))
  const [buildState, setBuildState] = useState<BuildState>(loadBuildState)
  const [activeBuildIdsByPath, setActiveBuildIdsByPath] = useState<PathSelectionIds>(() =>
    loadPathSelectionIds(activeBuildByPathStorageKey, activeBuildStorageKey, pathId),
  )
  // The rotation store is a module singleton, so its persisted state is read during the first
  // render rather than when its module happens to be imported, which a lazily loaded editor
  // decides. It has to be read before the editor picks the rotation to open on that same render,
  // and before this component subscribes, so the write lands on a store nothing is watching yet.
  const [rotationStoreRead, markRotationStoreRead] = useState(false)
  if (!rotationStoreRead) {
    markRotationStoreRead(true)
    useRotationStore.getState().initialise(pathId)
  }
  const activeRotationIdsByPath = useRotationStore(state => state.activeRotationIdsByPath)
  const activeResult = useRotationStore(state => state.result)
  const breakthrough = breakthroughProfile(settings)
  const enemy: EnemyProfile = breakthrough
  const availableBuildEntries = buildState.entries.filter(
    entry =>
      (devMode || !buildEntryIsTestPreset(entry)) &&
      buildEntryAvailableForPath(entry, typedPathDefinitions[pathId].buildGroup, settings.weapons),
  )
  const activeBuild =
    availableBuildEntries.find(entry => entry.id === activeBuildIdsByPath[pathId]) ??
    availableBuildEntries.find(entry => entry.id === defaultBuildIdForPath(pathId)) ??
    availableBuildEntries[0]
  const effectiveBuildState = useMemo(
    () => ({ ...buildState, activeBuildId: activeBuild?.id ?? "" }),
    [activeBuild?.id, buildState],
  )
  const buildTabMartialArtTags = useMemo(
    () => settings.weapons.map(weapon => martialArtDefinitions[weapon].tag),
    [settings.weapons],
  )
  const selectedRotationId = activeRotationIdsByPath[pathId] ?? defaultRotationIdForPath(pathId)
  const activeBuildDisplayName = activeBuild
    ? (activeBuild.isDefault ? gameText(activeBuild.name) : activeBuild.name) || "Unnamed Build"
    : "Unnamed Build"
  const activeBuildSetup = useMemo(() => resolveBuildSetup(activeBuild), [activeBuild])
  const [buildSetupOverrides, setBuildSetupOverrides] = useState<BuildSetupOverrides>(() =>
    loadBuildSetupOverrides(activeBuildSetup),
  )
  const activeStatState = useMemo(
    () =>
      resolveBuildStatState({
        build: activeBuild,
        gearItems: buildState.gearItems,
        settings,
        statOverrides,
        attunementOverrides,
        setupSelections,
        pathId,
        buildSetupOverrides,
      }),
    [
      activeBuild,
      buildState.gearItems,
      settings,
      statOverrides,
      attunementOverrides,
      setupSelections,
      pathId,
      buildSetupOverrides,
    ],
  )
  const currentGlobalDebuffs = loadGlobalDebuffs()
  /**
   * What a build is measured against. Everything here belongs to the sheet or the environment
   * rather than to any build, so a build measured without being activated resolves against the
   * same inputs the active one did.
   */
  const buildMeasurementContext = useMemo(
    () => ({
      environment: { pathId, settings, setupSelections, skillOverrides, globalDebuffs: currentGlobalDebuffs, enemy },
      statOverrides,
      attunementOverrides,
      buildSetupOverrides: { buildId: activeBuild?.id ?? "", overrides: buildSetupOverrides },
    }),
    [
      activeBuild?.id,
      pathId,
      settings,
      setupSelections,
      skillOverrides,
      currentGlobalDebuffs,
      enemy,
      statOverrides,
      attunementOverrides,
      buildSetupOverrides,
    ],
  )
  const character = useMemo(
    () => ({
      stats: activeStatState.stats,
      rawStats: activeStatState.rawStats,
      baseStats: activeStatState.baseStats,
      attunementStats: activeStatState.attunement,
      displayedAttunementStats: activeStatState.displayedAttunement,
      settings,
      enemy,
      derivedStats: activeStatState.derivedStats,
      innerWayRevision,
      setupSelections,
      gearStatEffect: activeStatState.gearStatEffect,
      buildSetup: activeStatState.buildSetup,
    }),
    [activeStatState, settings, enemy, innerWayRevision, setupSelections],
  )
  useActiveRotationResult({
    pathId,
    build: activeBuild,
    gearItems: buildState.gearItems,
    measurement: buildMeasurementContext,
    activeRotationId: selectedRotationId,
    defaultRotationId: defaultRotationIdForPath(pathId),
    devMode,
    weapons: settings.weapons,
  })
  const updateStatOverride = (key: keyof CharacterStats, value: number) => {
    setStatOverrides(current => ({ ...current, [key]: value }))
  }
  const resetStatOverride = (key: keyof CharacterStats) => {
    setStatOverrides(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
  }
  const updateAttunementOverride = (key: keyof AttunementStats, value: number) =>
    setAttunementOverrides(current => ({ ...current, [key]: value }))
  const resetAttunementOverride = (key: keyof AttunementStats) =>
    setAttunementOverrides(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
  function updateBuildSetupOverride<K extends keyof BuildSetup>(key: K, value: BuildSetup[K]) {
    setBuildSetupOverrides(current => {
      if (!sameBuildSetupValue(key, value, activeBuildSetup[key])) return { ...current, [key]: value }
      const next = { ...current }
      delete next[key]
      return next
    })
  }
  const resetBuildSetupOverride = (key: keyof BuildSetup) =>
    setBuildSetupOverrides(current => {
      const next = { ...current }
      delete next[key]
      return next
    })
  const applyCharacterProfile = (profile?: CharacterProfile) => {
    setStatOverrides(profile ? { ...profile.statOverrides } : {})
    setAttunementOverrides(profile ? { ...profile.attunementOverrides } : {})
    if (!profile) {
      setBuildSetupOverrides({})
      return
    }
    setBuildSetupOverrides({
      innerWays: profile.innerWays.map(row => ({ ...row })),
      weaponSets: { ...profile.buildSetup.weaponSets },
      armorSets: { ...profile.buildSetup.armorSets },
      bowRingSet: profile.buildSetup.bowRingSet,
      arsenal: profile.buildSetup.arsenal,
    })
  }
  const activateRotationForPath = useCallback(
    (id: string, targetPathId = pathId) => useRotationStore.getState().selectRotationForPath(id, targetPathId),
    [pathId],
  )
  const activeRotationDisplayName = activeResult?.rotationName ?? "—"
  const activateBuildForPath = useCallback(
    (id: string, targetPathId = pathId) => {
      setActiveBuildIdsByPath(current => {
        const next = withPathSelection(current, targetPathId, id)
        if (next !== current) setPersistentItem(activeBuildByPathStorageKey, JSON.stringify(next))
        return next
      })
      setBuildState(current => (current.activeBuildId === id ? current : { ...current, activeBuildId: id }))
    },
    [pathId],
  )
  const transitionPath = (
    nextPathId: PathId,
    options: { weapons?: [WeaponId, WeaponId]; rotationId?: string } = {},
  ) => {
    if (pathRequiresDev(typedPathDefinitions[nextPathId]) && !devMode) return
    const nextSettings =
      nextPathId === "mixed" && options.weapons
        ? { ...settingsForPath(settings, nextPathId), weapons: [...options.weapons] as [WeaponId, WeaponId] }
        : settingsForPath(settings, nextPathId)
    const nextBuildEntries = buildState.entries.filter(
      entry =>
        (devMode || !buildEntryIsTestPreset(entry)) &&
        buildEntryAvailableForPath(entry, typedPathDefinitions[nextPathId].buildGroup, nextSettings.weapons),
    )
    const nextRotationEntries = loadRotationEntries().filter(
      entry => (devMode || !entry.test) && rotationAvailableForWeapons(entry, nextSettings.weapons),
    )
    const selection = resolvePathWorkspaceSelection({
      buildIds: nextBuildEntries.map(entry => entry.id),
      rotationIds: nextRotationEntries.map(entry => entry.id),
      savedBuildId: activeBuildIdsByPath[nextPathId],
      savedRotationId: activeRotationIdsByPath[nextPathId],
      requestedRotationId: options.rotationId,
      defaultBuildId: defaultBuildIdForPath(nextPathId),
      defaultRotationId: defaultRotationIdForPath(nextPathId),
    })
    if (!selection) return

    useDpsStore.getState().supersede()
    // A calculation is keyed by the whole bundle, so another path's results can never be
    // read as this path's, but nothing reaches for them again either. Switching paths
    // forgets them so the cache holds the path in use rather than every path visited.
    if (nextPathId !== pathId) useDpsStore.getState().reset()
    useRotationStore.getState().clear()

    const nextBuildIds = withPathSelection(activeBuildIdsByPath, nextPathId, selection.buildId)
    const nextRotationIds = withPathSelection(activeRotationIdsByPath, nextPathId, selection.rotationId)
    if (nextBuildIds !== activeBuildIdsByPath)
      setPersistentItem(activeBuildByPathStorageKey, JSON.stringify(nextBuildIds))
    setPersistentItem(pathStorageKey, nextPathId)
    setActiveBuildIdsByPath(nextBuildIds)
    useRotationStore.getState().setRotationsByPath(nextRotationIds)
    setBuildState(current => ({ ...current, activeBuildId: selection.buildId }))
    setPathId(nextPathId)
    setSettings(nextSettings)
    setInnerWayRevision(current => current + 1)
  }
  const selectPath = (nextPathId: PathId) => transitionPath(nextPathId)
  const selectBuildWeapons = (nextWeapons: [WeaponId, WeaponId], rotationId?: string) => {
    const matchingPath = (Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).find(
      ([candidateId, definition]) =>
        candidateId !== "mixed" &&
        (!pathRequiresDev(definition) || devMode) &&
        definition.lockedWeapons &&
        sameWeaponPair(definition.lockedWeapons, nextWeapons),
    )
    const nextPathId = matchingPath?.[0] ?? (devMode ? "mixed" : undefined)
    if (!nextPathId) return false
    transitionPath(nextPathId, { weapons: nextWeapons, rotationId })
    return true
  }
  const toggleDevMode = () => {
    const nextDevMode = !devMode
    setPersistentItem(devModeStorageKey, String(nextDevMode))
    setDevMode(nextDevMode)
    if (!nextDevMode && pathRequiresDev(typedPathDefinitions[pathId])) selectPath("stonesplitStrength")
    if (!nextDevMode && isLocaleWip(locale)) void changeLocale("en")
  }
  const changeLocale = async (nextLocale: string) => {
    if (await selectLocale(nextLocale)) setLocale(getLocale())
  }
  const changeLayoutPreview = (nextLayout: LayoutMode) => {
    setPersistentItem(layoutPreviewStorageKey, nextLayout)
    setLayoutPreview(nextLayout)
  }
  const updateSkillOverrides = (nextOverrides: SkillOverrides) => {
    setSkillOverrides(nextOverrides)
    if (hasSkillOverrides(nextOverrides)) setPersistentItem(skillStorageKey, serializeSkillOverrides(nextOverrides))
    else removePersistentItem(skillStorageKey)
  }

  useEffect(() => setPersistentItem(statOverrideStorageKey, JSON.stringify(statOverrides)), [statOverrides])
  useEffect(
    () => setPersistentItem(characterProfileStorageKey, serializeCharacterProfiles(characterProfiles)),
    [characterProfiles],
  )
  if (activeBuild && activeBuildIdsByPath[pathId] === activeBuild.id && activeBuild.id !== buildState.activeBuildId)
    setBuildState(current => ({ ...current, activeBuildId: activeBuild.id }))
  if (activeBuild && activeBuildIdsByPath[pathId] !== activeBuild.id)
    setActiveBuildIdsByPath(withPathSelection(activeBuildIdsByPath, pathId, activeBuild.id))
  useEffect(() => {
    setPersistentItem(activeBuildByPathStorageKey, JSON.stringify(activeBuildIdsByPath))
  }, [activeBuildIdsByPath])
  useEffect(() => setPersistentItem(buildListStorageKey, serializeBuildState(buildState)), [buildState])
  useEffect(
    () => setPersistentItem(attunementOverrideStorageKey, JSON.stringify(attunementOverrides)),
    [attunementOverrides],
  )
  useEffect(
    () => setPersistentItem(buildSetupOverrideStorageKey, JSON.stringify(buildSetupOverrides)),
    [buildSetupOverrides],
  )
  useEffect(
    () => setPersistentItem(settingsStorageKey, JSON.stringify({ weapons: settings.weapons, ping: settings.ping })),
    [settings.weapons, settings.ping],
  )
  useEffect(() => setPersistentItem(pathStorageKey, pathId), [pathId])

  return (
    <main
      className={`page-shell layout-${layoutMode} ${layoutMode === "pc" && (activeTab === "build" || activeTab === "rotations") ? "viewport-page-shell" : ""}`}
      data-layout={layoutMode}
    >
      <header className="page-header">
        <div className="page-header-start">
          <h1>{t("ui.app.whereBuildsMeet")}</h1>
          <p className="intro">{t("ui.app.buildSimulateAndOptimizeForWhereWindsMeet")}</p>
          <section className="path-selector" aria-label={t("ui.app.combatPath")}>
            <div className="path-selector-options">
              {(Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).map(([value, definition]) => {
                const icon = pathIcons[value]
                return (
                  <button
                    className={pathId === value ? "selected" : ""}
                    type="button"
                    key={value}
                    aria-pressed={pathId === value}
                    disabled={pathRequiresDev(definition) && !devMode}
                    onClick={() => selectPath(value)}
                  >
                    {icon && <img src={icon} alt="" />}
                    <span>{gameText(definition.name)}</span>
                    {definition.status !== "available" && (
                      <Chip className="path-status-badge">{pathStatusLabel(definition)}</Chip>
                    )}
                  </button>
                )
              })}
            </div>
          </section>
        </div>
        <div className="page-header-end">
          <div className="page-header-controls">
            <NoticeArea />
            <label className="locale-selector">
              <span>{t("ui.app.language")}</span>
              <select value={locale} onChange={event => void changeLocale(event.target.value)}>
                {getSupportedLocales().map(supportedLocale => (
                  <option
                    value={supportedLocale}
                    key={supportedLocale}
                    disabled={!devMode && isLocaleWip(supportedLocale)}
                  >
                    {getLocaleDisplayName(supportedLocale)}
                  </option>
                ))}
              </select>
            </label>
            <Button
              className="dev-mode-button"
              variant="secondary"
              type="button"
              aria-pressed={devMode}
              onClick={toggleDevMode}
            >
              {t("ui.app.dev")}
            </Button>
          </div>
          <div className="project-links">
            <a href="https://discord.gg/UtqAw8HaXA" target="_blank" rel="noreferrer">
              <IconBrandDiscord size="1em" aria-hidden />
              <span>{t("ui.app.discord")}</span>
            </a>
            <a href="https://github.com/greydust/where-builds-meet" target="_blank" rel="noreferrer">
              <IconBrandGithub size="1em" aria-hidden />
              <span>{t("ui.app.github")}</span>
            </a>
          </div>
        </div>
      </header>
      <nav className="main-tabs" aria-label={t("ui.app.mainSections")}>
        <Tab active={activeTab === "main"} onClick={() => setActiveTab("main")}>
          {t("ui.app.main")}
        </Tab>
        <Tab active={activeTab === "build"} onClick={() => setActiveTab("build")}>
          {t("ui.app.build")}
        </Tab>
        <Tab active={activeTab === "breakdown"} onClick={() => setActiveTab("breakdown")}>
          {t("ui.app.dpsBreakdown", {
            dps: activeResult?.metrics.hps ? `${t("system.dps")} / ${t("system.hps")}` : t("system.dps"),
          })}
        </Tab>
        <Tab
          active={activeTab === "rotations"}
          onClick={() => {
            setRotationsMounted(true)
            setActiveTab("rotations")
          }}
        >
          {t("ui.app.rotationEditor")}
        </Tab>
        <Tab
          active={activeTab === "simulation"}
          onClick={() => {
            setSimulationMounted(true)
            setActiveTab("simulation")
          }}
        >
          {t("ui.app.simulation")}
        </Tab>
        <Tab active={activeTab === "skills"} modified={skillEditorModified} onClick={() => setActiveTab("skills")}>
          {t("ui.app.skillEditor")}
        </Tab>
        <Tab active={activeTab === "settings"} onClick={() => setActiveTab("settings")}>
          {t("ui.app.settings")}
        </Tab>
      </nav>
      {activeTab === "main" ? (
        <StatsTab
          character={character}
          pathId={pathId}
          statOverrides={statOverrides}
          attunementOverrides={attunementOverrides}
          characterProfiles={characterProfiles}
          buildSetupOverrides={buildSetupOverrides}
          onStatChange={updateStatOverride}
          onStatReset={resetStatOverride}
          onAttunementChange={updateAttunementOverride}
          onAttunementReset={resetAttunementOverride}
          onApplyCharacterProfile={applyCharacterProfile}
          onCharacterProfilesChange={setCharacterProfiles}
          onBreakthroughChange={breakthrough => setSettings(current => ({ ...current, breakthrough }))}
          onBuildSetupChange={updateBuildSetupOverride}
          onBuildSetupReset={resetBuildSetupOverride}
          rotationMetrics={activeResult?.metrics}
          graduationDps={activeResult?.graduation?.dps}
          activeBuildName={activeBuildDisplayName}
          activeRotationName={activeRotationDisplayName}
          onInnerWayChange={() => setInnerWayRevision(current => current + 1)}
          onSetupSelectionChange={(key, value) => setSetupSelections(current => ({ ...current, [key]: value }))}
        />
      ) : activeTab === "build" ? (
        <FeatureLoadBoundary>
          <Suspense fallback={tabSuspenseFallback}>
            <div className="viewport-tab-content">
              <BuildTab
                weapons={settings.weapons}
                martialArtTags={buildTabMartialArtTags}
                pathTag={pathId === "mixed" ? undefined : typedPathDefinitions[pathId].tag}
                buildGroup={typedPathDefinitions[pathId].buildGroup}
                graduatedBuildIds={typedPathDefinitions[pathId].graduated}
                devMode={devMode}
                buildState={effectiveBuildState}
                onBuildStateChange={setBuildState}
                onActiveBuildChange={activateBuildForPath}
                onSelectBuildWeapons={selectBuildWeapons}
                measurement={buildMeasurementContext}
                activeRotation={activeResult?.rotation}
                activeRotationName={activeRotationDisplayName}
              />
            </div>
          </Suspense>
        </FeatureLoadBoundary>
      ) : activeTab === "breakdown" ? (
        <BreakdownTab metrics={activeResult?.metrics} pathId={pathId} />
      ) : activeTab === "skills" ? (
        <SkillEditorTab
          weapons={settings.weapons}
          overrides={skillOverrides}
          onOverridesChange={updateSkillOverrides}
        />
      ) : activeTab === "settings" ? (
        <SettingsTab
          settings={settings}
          pathId={pathId}
          devMode={devMode}
          layoutMode={layoutMode}
          onSettingsChange={setSettings}
          onLayoutChange={changeLayoutPreview}
        />
      ) : null}
      {rotationsMounted && (
        <div className={`viewport-tab-content ${activeTab === "rotations" ? "" : "tab-hidden"}`}>
          <FeatureLoadBoundary>
            <Suspense fallback={tabSuspenseFallback}>
              <RotationEditorTab
                key={pathId}
                character={character}
                pathId={pathId}
                devMode={devMode}
                active={activeTab === "rotations"}
                defaultRotationId={defaultRotationIdForPath(pathId)}
                selectedRotationId={selectedRotationId}
                skillOverrides={skillOverrides}
                onSelectRotationWeapons={selectBuildWeapons}
                onActiveRotationChange={activateRotationForPath}
              />
            </Suspense>
          </FeatureLoadBoundary>
        </div>
      )}
      {simulationMounted && (
        <div className={activeTab === "simulation" ? "" : "tab-hidden"}>
          <FeatureLoadBoundary>
            <Suspense fallback={null}>
              <SimulationTab
                bundle={activeResult?.bundle}
                bundleKey={activeResult?.bundleKey}
                rotationName={activeResult ? activeRotationDisplayName : undefined}
                buildName={activeBuildDisplayName}
              />
            </Suspense>
          </FeatureLoadBoundary>
        </div>
      )}
      <footer className="page-footer">
        <span>{t("ui.app.authorGreydustWwmIgnGreydustDiscord")}</span>
        <span className="page-footer-accuracy">
          {t("ui.app.accuracyMatters")}{" "}
          <a href="https://github.com/greydust/where-builds-meet/issues" target="_blank" rel="noreferrer">
            {t("ui.app.reportAnyDamageDiscrepancy")}
          </a>
        </span>
      </footer>
    </main>
  )
}
