export const OUTCOME_BUFF_TICKS_PER_SECOND = 10_000;

export type ExpectedOutcomeBuffSchedule = Record<string, Record<string, number>>;

export function outcomeBuffTick(seconds: number | undefined) {
  return Math.round((seconds ?? 0) * OUTCOME_BUFF_TICKS_PER_SECOND);
}

export function outcomeProbability(value: number) {
  return Math.min(1, Math.max(0, value));
}

/** First strictly later grid boundary, never earlier than battle second one. */
export function nextBattlePeriodicTick(time: number, interval: number, origin: number) {
  const step = outcomeBuffTick(interval);
  const start = outcomeBuffTick(origin);
  return (
    (start + Math.max(1, Math.floor((outcomeBuffTick(time) - start) / step) + 1) * step) / OUTCOME_BUFF_TICKS_PER_SECOND
  );
}

type PeriodicOutcome = {
  stack: number;
  expires: number;
  /** Absolute probability mass by next tick; cadence does not affect stack transitions. */
  cadences?: Map<number, number>;
  /** Newly applied mass that must wait past the current shared boundary. */
  pendingTickProbability?: number;
  probability: number;
  source?: string;
  branch?: string;
};

export type MaxStackAction = { consume: "all"; trigger: string; triggerTags?: string[] };

export function maxStackActionFor(stack: number, maxStack: number | undefined, action?: MaxStackAction) {
  return action?.consume === "all" && maxStack !== undefined && stack >= maxStack ? action : undefined;
}

/** Marginal stack/expiry distribution with exact or battle-aligned tick cadences. */
export class ExpectedPeriodicTracker {
  private sharedTick?: number;

  private advanceSharedTick(tick: number) {
    if (this.sharedTick !== undefined && tick <= this.sharedTick) return;
    this.sharedTick = tick;
    for (const states of this.branches.values()) for (const state of states.values()) state.pendingTickProbability = 0;
  }
  private branches = new Map<string | undefined, Map<string, PeriodicOutcome>>([
    [undefined, new Map([["0:0:", { stack: 0, expires: 0, probability: 1 }]])],
  ]);

  /** Diagnostic count without flattening the branch-owned distribution. */
  get stateCount() {
    let count = 0;
    for (const states of this.branches.values()) count += states.size;
    return count;
  }

  private add(state: PeriodicOutcome, scale = 1, now?: number) {
    const probability = state.probability * scale;
    if (probability <= 0) return;
    let states = this.branches.get(state.branch);
    if (!states) this.branches.set(state.branch, (states = new Map()));
    const key = `${state.stack}:${state.expires}:${state.source ?? ""}`;
    const merged = states.get(key) ?? {
      ...state,
      probability: 0,
      pendingTickProbability: 0,
      cadences: state.cadences ? new Map<number, number>() : undefined,
    };
    merged.probability += probability;
    merged.pendingTickProbability = (merged.pendingTickProbability ?? 0) + (state.pendingTickProbability ?? 0) * scale;
    if (state.cadences) {
      const interval = outcomeBuffTick(this.interval);
      for (const [tick, mass] of state.cadences) {
        const advanced = now !== undefined && tick < now ? tick + Math.ceil((now - tick) / interval) * interval : tick;
        merged.cadences!.set(advanced, (merged.cadences!.get(advanced) ?? 0) + mass * scale);
      }
    }
    states.set(key, merged);
  }

  constructor(
    private readonly interval: number,
    private readonly firstTick: number,
    private readonly tickOrigin?: number,
  ) {}

  apply(
    time: number,
    chance: number,
    duration: number,
    maxStack: number,
    gain: number,
    source: string,
    onMaxStack?: MaxStackAction,
    emittedBranch?: string,
    onlyBranch?: string,
  ) {
    const now = outcomeBuffTick(time);
    if (this.tickOrigin !== undefined) {
      const origin = outcomeBuffTick(this.tickOrigin);
      const interval = outcomeBuffTick(this.interval);
      this.advanceSharedTick(origin + Math.max(1, Math.ceil((now - origin) / interval)) * interval);
    }
    const firstTick = now + outcomeBuffTick(this.firstTick);
    // Detach only the affected partition. Other branches retain their objects,
    // cadence maps, and merge indexes without being visited or reconstructed.
    let affected: Map<string | undefined, Map<string, PeriodicOutcome>>;
    if (onlyBranch === undefined) {
      affected = this.branches;
      this.branches = new Map();
    } else {
      const states = this.branches.get(onlyBranch);
      if (!states) return 0;
      affected = new Map([[onlyBranch, states]]);
      this.branches.delete(onlyBranch);
    }
    let thresholdProbability = 0;
    const add = (state: PeriodicOutcome, scale = 1) => this.add(state, scale, now);
    for (const states of affected.values())
      for (const previous of states.values()) {
        const active = previous.stack > 0 && previous.expires > now;
        const state = active
          ? { ...previous }
          : { stack: 0, expires: 0, probability: previous.probability, branch: previous.branch };
        add(state, 1 - chance);
        if (maxStackActionFor(state.stack + gain, maxStack, onMaxStack)) {
          const probability = state.probability * chance;
          thresholdProbability += probability;
          add({ stack: 0, expires: 0, probability, branch: emittedBranch });
          continue;
        }
        let cadences: Map<number, number> | undefined;
        let pendingTickProbability: number | undefined;
        if (this.tickOrigin === undefined)
          cadences = active ? state.cadences : new Map([[firstTick, state.probability]]);
        else {
          pendingTickProbability = active ? state.pendingTickProbability : 0;
          if (!active && now === this.sharedTick) pendingTickProbability = state.probability;
        }
        add(
          {
            stack: Math.min(maxStack, state.stack + gain),
            expires: now + outcomeBuffTick(duration),
            cadences,
            pendingTickProbability,
            probability: state.probability,
            source,
            branch: state.branch,
          },
          chance,
        );
      }
    return thresholdProbability;
  }

  expire(time: number, source: string, chance: number, branch: string) {
    const expires = outcomeBuffTick(time);
    let probability = 0;
    let failedProbability = 0;
    for (const [id, states] of this.branches) {
      for (const [key, state] of states) {
        if (!state.stack || state.expires !== expires || state.source !== source) continue;
        probability += state.probability * chance;
        failedProbability += state.probability * (1 - chance);
        states.delete(key);
      }
      if (!states.size) this.branches.delete(id);
    }
    this.add({ stack: 0, expires: 0, probability: failedProbability });
    this.add({ stack: 0, expires: 0, probability, branch });
    return probability;
  }

  releaseBranch(branch: string) {
    const states = this.branches.get(branch);
    if (!states) return;
    this.branches.delete(branch);
    for (const state of states.values()) this.add({ ...state, branch: undefined });
  }

  consumeTick(time: number) {
    const tick = outcomeBuffTick(time);
    const interval = outcomeBuffTick(this.interval);
    if (this.tickOrigin !== undefined) {
      this.advanceSharedTick(outcomeBuffTick(nextBattlePeriodicTick(time, this.interval, this.tickOrigin)));
      return;
    }
    for (const states of this.branches.values())
      for (const state of states.values()) {
        if (!state.cadences) continue;
        for (const [nextTick, mass] of [...state.cadences]) {
          if (nextTick > tick) continue;
          const advanced = nextTick + (Math.floor((tick - nextTick) / interval) + 1) * interval;
          state.cadences.delete(nextTick);
          state.cadences.set(advanced, (state.cadences.get(advanced) ?? 0) + mass);
        }
      }
  }

  nextTick(afterTime: number, includeCurrentTime = false) {
    const after = outcomeBuffTick(afterTime) + (includeCurrentTime ? 0 : 1);
    const interval = outcomeBuffTick(this.interval);
    if (this.tickOrigin !== undefined) {
      if (this.sharedTick === undefined) return undefined;
      const origin = outcomeBuffTick(this.tickOrigin);
      const first = Math.max(this.sharedTick, origin + Math.max(1, Math.ceil((after - origin) / interval)) * interval);
      // New mass applied exactly on an unprocessed boundary waits one interval;
      // previously active mass can still participate in that boundary.
      for (const tick of [first, first + interval])
        for (const states of this.branches.values())
          for (const state of states.values())
            if (
              state.stack &&
              tick < state.expires &&
              state.probability - (tick === this.sharedTick ? (state.pendingTickProbability ?? 0) : 0) > 0
            )
              return tick / OUTCOME_BUFF_TICKS_PER_SECOND;
      return undefined;
    }
    let earliest = Infinity;
    for (const states of this.branches.values())
      for (const state of states.values()) {
        if (!state.stack) continue;
        for (const next of state.cadences?.keys() ?? []) {
          const tick = next < after ? next + Math.ceil((after - next) / interval) * interval : next;
          if (tick < state.expires) earliest = Math.min(earliest, tick);
        }
      }
    return Number.isFinite(earliest) ? earliest / OUTCOME_BUFF_TICKS_PER_SECOND : undefined;
  }

  tickAt(time: number) {
    const tick = outcomeBuffTick(time);
    const interval = outcomeBuffTick(this.interval);
    const result = { time, probability: 0, sources: {} as Record<string, number> };
    if (
      this.tickOrigin !== undefined &&
      (this.sharedTick === undefined ||
        tick < this.sharedTick ||
        (tick - outcomeBuffTick(this.tickOrigin)) % interval !== 0)
    )
      return result;
    for (const states of this.branches.values())
      for (const state of states.values()) {
        if (!state.stack || tick >= state.expires) continue;
        if (this.tickOrigin !== undefined) {
          const mass = state.probability - (tick === this.sharedTick ? (state.pendingTickProbability ?? 0) : 0);
          result.probability += mass;
          if (state.source) result.sources[state.source] = (result.sources[state.source] ?? 0) + mass;
          continue;
        }
        for (const [next, mass] of state.cadences ?? []) {
          if (tick < next || (tick - next) % interval !== 0) continue;
          result.probability += mass;
          if (state.source) result.sources[state.source] = (result.sources[state.source] ?? 0) + mass;
        }
      }
    return result;
  }

  expirationProbability(time: number, source: string) {
    const tick = outcomeBuffTick(time);
    let probability = 0;
    for (const states of this.branches.values())
      for (const state of states.values())
        if (state.stack && state.expires === tick && state.source === source) probability += state.probability;
    return probability;
  }
}
