// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";
import { initializeI18n } from "../src/i18n";
import english from "../public/locales/en.json";
import { requestEditorTimeline } from "../src/calculations/rotationWorkerClient";

vi.mock("../src/calculations/rotationWorkerClient", () => ({
  requestRotationBaseline: vi.fn(() => new Promise(() => {})),
  requestRotationComparisons: vi.fn(() => new Promise(() => {})),
  requestEditorTimeline: vi.fn(() => new Promise(() => {})),
  supersedeRotationCalculationRequests: vi.fn(),
}));

let container: HTMLDivElement;
let root: Root;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
    })),
  );
  await initializeI18n();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find((node) => node.textContent?.trim() === text);
  expect(button, text).toBeDefined();
  await act(async () => button!.click());
}
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function commit(input: HTMLInputElement, trigger: "enter" | "blur" = "blur") {
  await act(async () => {
    if (trigger === "enter") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    else input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
}
it("adds a timed Hellfire event, edits signed amounts, and saves it", async () => {
  await act(async () => root.render(<App />));
  await click("Rotation Editor");
  await click("Duplicate");
  const selects = [...container.querySelectorAll<HTMLSelectElement>('select[aria-label="Skill or event"]')];
  expect(selects.length).toBeGreaterThan(1);
  const select = selects[1];
  await act(async () => {
    select.value = "__event:Hellfire";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const amount = container.querySelector<HTMLInputElement>(
    'input[aria-label="Hellfire change (+ adds / - subtracts)"]',
  )!;
  expect(amount).not.toBeNull();
  await fill(amount, "-12.5");
  await commit(amount);
  expect(amount.value).toBe("-12.5");
  const time = amount.closest(".rotation-table-row")!.querySelector<HTMLInputElement>("input.rotation-event-time")!;
  await fill(time, "3.25");
  await commit(time);
  await click("Save");
  const entries = JSON.parse(localStorage.getItem("wwm-rotation-list-session-v1")!);
  expect(entries.flatMap((entry: { rotation: { steps: unknown[] } }) => entry.rotation.steps)).toContainEqual({
    type: "event",
    event: "Hellfire",
    startTime: 3.25,
    amount: -12.5,
  });
  await fill(amount, "25");
  await commit(amount);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  expect(
    vi
      .mocked(requestEditorTimeline)
      .mock.calls.some(([bundle]) =>
        bundle.timeline.rotation.steps.some(
          (step) => step.type === "event" && step.event === "Hellfire" && step.amount === 25,
        ),
      ),
  ).toBe(true);
});
