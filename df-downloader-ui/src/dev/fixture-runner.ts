/**
 * Plays the task fixtures into the live Redux store. DEV ONLY - see the header
 * of task-fixtures.ts for why nothing may import this from shipping code.
 *
 * How it gets state on screen: the tasks reducer accepts the plain
 * `tasks/QUERY_TASKS_SUCCESS` action directly, so a fixture is just that
 * action with a hand-built TasksResponse payload. Nothing is mocked, patched
 * or intercepted at the network layer; the page renders fixture state through
 * exactly the same selectors and components it uses for real state.
 *
 * Holding the state still is the fiddly part. The backend pushes a fresh task
 * snapshot over SSE (subscribeToChannel("tasks", ...) in App.tsx), and the
 * next push would wipe the fixture out within a second. So while a fixture is
 * playing, store.dispatch is wrapped and any QUERY_TASKS_SUCCESS that did not
 * come from here is dropped. Everything else - content, config, auth - carries
 * on untouched, and the wrapper stops dropping the moment the fixture stops.
 * Dropping the action rather than closing the stream means the SSE connection,
 * its reconnect logic and every other channel keep working normally.
 */
import { queryTasks } from "../store/df-tasks/tasks.action";
import { store } from "../store/store";
import { FIXTURE_SCENARIOS, FixtureScenario, emptyTasksResponse, getScenario } from "./task-fixtures";

/** How often an animated scenario advances. Fast enough to look alive, slow enough to read. */
const TICK_INTERVAL_MS = 500;

type FixtureRunnerState = {
  scenario: FixtureScenario | null;
  ticking: boolean;
  tick: number;
};

let state: FixtureRunnerState = { scenario: null, ticking: true, tick: 0 };
let timer: ReturnType<typeof setInterval> | null = null;
let dispatchWrapped = false;

const subscribers = new Set<() => void>();
const notify = () => subscribers.forEach((subscriber) => subscriber());

/** Marks the actions this module dispatches, so the wrapper can tell them from the real stream's. */
type FixtureAction = ReturnType<typeof queryTasks.success> & { meta?: { fixture?: true } };
const isFixtureAction = (action: unknown): boolean =>
  Boolean((action as FixtureAction)?.meta?.fixture);

const wrapDispatch = () => {
  if (dispatchWrapped) {
    return;
  }
  dispatchWrapped = true;
  const realDispatch = store.dispatch;
  store.dispatch = ((action: Parameters<typeof realDispatch>[0]) => {
    const isTaskSnapshot =
      typeof action === "object" && action !== null && (action as { type?: string }).type === queryTasks.success.type;
    if (state.scenario && isTaskSnapshot && !isFixtureAction(action)) {
      // A real snapshot arriving mid-fixture. Swallow it - returning the
      // action unchanged keeps dispatch's contract for any caller that reads
      // the return value.
      return action;
    }
    return realDispatch(action);
  }) as typeof store.dispatch;
};

const push = () => {
  if (!state.scenario) {
    return;
  }
  const payload = state.scenario.build(state.tick);
  store.dispatch({ ...queryTasks.success(payload), meta: { fixture: true } } as FixtureAction);
};

const stopTimer = () => {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
};

const startTimer = () => {
  stopTimer();
  if (!state.scenario?.animated || !state.ticking) {
    return;
  }
  timer = setInterval(() => {
    state = { ...state, tick: state.tick + 1 };
    push();
  }, TICK_INTERVAL_MS);
};

/** Plays a scenario by id. Returns false if there is no such scenario. */
export const play = (scenarioId: string): boolean => {
  const scenario = getScenario(scenarioId);
  if (!scenario) {
    console.warn(
      `[df-fixtures] No scenario "${scenarioId}". Available: ${FIXTURE_SCENARIOS.map((s) => s.id).join(", ")}`
    );
    return false;
  }
  wrapDispatch();
  state = { ...state, scenario, tick: 0 };
  push();
  startTimer();
  showBanner();
  notify();
  return true;
};

/**
 * Stops the fixture and hands the page back to the real stream.
 *
 * The store is left holding an empty task list rather than the fixture's, so
 * nothing fake lingers if the backend is not currently pushing. The next real
 * SSE snapshot repopulates it - which for an idle app only happens when
 * something actually changes, so an empty Activity page immediately after
 * stopping is expected, not a bug.
 */
export const stop = () => {
  stopTimer();
  const wasPlaying = Boolean(state.scenario);
  state = { ...state, scenario: null, tick: 0 };
  if (wasPlaying) {
    store.dispatch(queryTasks.success(emptyTasksResponse()));
  }
  hideBanner();
  notify();
};

/** Freezes or resumes an animated scenario without changing which one is playing. */
export const setTicking = (ticking: boolean) => {
  state = { ...state, ticking };
  startTimer();
  notify();
};

/** Advances an animated scenario by one frame while it's frozen. */
export const step = () => {
  if (!state.scenario) {
    return;
  }
  state = { ...state, tick: state.tick + 1 };
  push();
  notify();
};

export const getState = (): FixtureRunnerState => state;
export const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
};

const BANNER_ID = "df-fixture-banner";

/**
 * A plain DOM banner rather than a React component, deliberately: it has to be
 * visible on every page, and it must not require a single line of shipping
 * code to reference this module.
 */
const showBanner = () => {
  if (typeof document === "undefined") {
    return;
  }
  let banner = document.getElementById(BANNER_ID);
  if (!banner) {
    banner = document.createElement("div");
    banner.id = BANNER_ID;
    banner.setAttribute(
      "style",
      [
        "position:fixed",
        "top:0",
        "left:0",
        "right:0",
        "z-index:2147483647",
        "display:flex",
        "gap:12px",
        "align-items:center",
        "justify-content:center",
        "padding:6px 12px",
        "background:repeating-linear-gradient(135deg,#b45309,#b45309 10px,#92400e 10px,#92400e 20px)",
        "color:#fff",
        "font:600 12px/1.4 system-ui,sans-serif",
        "letter-spacing:0.04em",
        "text-transform:uppercase",
        "box-shadow:0 1px 6px rgba(0,0,0,0.4)",
      ].join(";")
    );
    const stopButton = document.createElement("button");
    stopButton.textContent = "Stop";
    stopButton.setAttribute(
      "style",
      [
        "font:inherit",
        "cursor:pointer",
        "border:1px solid rgba(255,255,255,0.7)",
        "background:transparent",
        "color:inherit",
        "border-radius:4px",
        "padding:1px 8px",
      ].join(";")
    );
    stopButton.addEventListener("click", () => stop());
    const label = document.createElement("span");
    label.id = `${BANNER_ID}-label`;
    banner.appendChild(label);
    banner.appendChild(stopButton);
    document.body.appendChild(banner);
  }
  const label = document.getElementById(`${BANNER_ID}-label`);
  if (label) {
    label.textContent = `Fake task data - fixture "${state.scenario?.label ?? ""}" is playing`;
  }
};

const hideBanner = () => {
  document.getElementById(BANNER_ID)?.remove();
};

export const scenarios = FIXTURE_SCENARIOS;

/**
 * Console handle, for driving fixtures without leaving the page you're
 * looking at: `__DF_FIXTURES__.play("failed")`, `.stop()`, `.list()`.
 */
if (import.meta.env.DEV && typeof window !== "undefined") {
  (window as unknown as Record<string, unknown>).__DF_FIXTURES__ = {
    play,
    stop,
    step,
    setTicking,
    list: () => FIXTURE_SCENARIOS.map(({ id, label, description }) => ({ id, label, description })),
  };
}
