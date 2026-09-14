// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import App from "../src/App";
import { initializeI18n } from "../src/i18n";
import english from "../public/locales/en.json";
import { requestRotationBaseline, requestEditorTimeline } from "../src/calculations/rotationWorkerClient";

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
it("persists Settings ping across remount and includes it in worker snapshots", async () => {
  await act(async () => root.render(<App />));
  await click("Settings");
  const control = () => container.querySelector(".settings-panel input[type=number]") as HTMLInputElement;
  expect(control().value).toBe("40");
  await fill(control(), "85");
  expect(JSON.parse(localStorage.getItem("wwm-settings-session-v1")!).ping).toBe(85);
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300);
  });
  const bundles = [
    ...vi.mocked(requestRotationBaseline).mock.calls,
    ...vi.mocked(requestEditorTimeline).mock.calls,
  ].map(([bundle]) => bundle);
  expect(bundles.some((bundle) => bundle.timeline.rotation.ping === 85)).toBe(true);
  await act(async () => root.unmount());
  root = createRoot(container);
  await act(async () => root.render(<App />));
  await click("Settings");
  expect(control().value).toBe("85");
  await click("Rotation Editor");
  const ping = container.querySelector('input[title="Leave blank to use the ping from Settings."]') as HTMLInputElement;
  expect(ping.placeholder).toBe("85");
  expect(ping.closest("label")?.previousElementSibling?.textContent).toContain("Group Type");
  await click("Duplicate");
  const customPing = container.querySelector(
    'input[title="Leave blank to use the ping from Settings."]',
  ) as HTMLInputElement;
  expect(customPing.disabled).toBe(false);
  await fill(customPing, "0");
  await click("Save");
  const rotations = JSON.parse(localStorage.getItem("wwm-rotation-list-session-v1")!);
  expect(rotations.some((entry: { rotation: { ping?: number } }) => entry.rotation.ping === 0)).toBe(true);
  await fill(customPing, "");
  expect(customPing.value).toBe("");
  expect(customPing.placeholder).toBe("85");
});
