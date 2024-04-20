import { Mutex } from "async-mutex";
import { CachedEventEmitter } from "../utils/event-emitter.js";
import { LoggerType, makeLogger } from "../utils/log.js";
import { ActionPayloadMap, NonPayloadActions, PayloadActions, StateEventMap } from "./fsm.types.internal.js";
import { ActionMap, DefaultExceptionHandlerFn, FsmOpts, StateTransitions } from "./fsm.types.js";

export * from "./fsm-builder.js";
export * from "./fsm-builder.types.js";
export * from "./fsm.types.js";

export class FSM<
  States extends string,
  ActionPayloads extends ActionPayloadMap<any>,
  Context = undefined
> extends CachedEventEmitter<StateEventMap<States>> {
  private state: States;
  private transitions: StateTransitions<States, ActionPayloads, Context>;
  private defaultActionHandlers: ActionMap<States, ActionPayloads, Context>;
  private finalStates: States[];
  private defaultErrorHandler?: DefaultExceptionHandlerFn<States, ActionPayloads, Context>;
  readonly context: Context;
  readonly label: string;
  private log: LoggerType;
  private readonly mutex = new Mutex();

  private readonly dispatchArg;

  constructor({
    initialState,
    finalState,
    transitions,
    defaultActionHandlers,
    label,
    logger,
    context,
    defaultErrorHandler: defaultExceptionHandler,
  }: FsmOpts<States, ActionPayloads, Context>) {
    super();
    this.state = initialState;
    this.transitions = transitions;
    this.defaultActionHandlers = defaultActionHandlers || {};
    this.context = context as any;
    this.label = label || "FSM";
    this.log = makeLogger(this.label, logger);
    this.defaultErrorHandler = defaultExceptionHandler;
    this.dispatchArg = this.dispatch.bind(this);
    this.finalStates =
      (typeof finalState === "string" && [finalState]) ||
      (Array.isArray(finalState) && finalState) ||
      Object.entries(transitions).reduce((finalStates, [state, actions]) => {
        if (actions === null) {
          finalStates.push(state as States);
        }
        return finalStates;
      }, [] as States[]);
  }

  private isValidState(state: string): state is States {
    return Object.keys(this.transitions).includes(state);
  }

  public async dispatch<ACTION extends NonPayloadActions<ActionPayloads>>(action: ACTION): Promise<States>;
  public async dispatch<ACTION extends PayloadActions<ActionPayloads>>(
    action: ACTION,
    payload: ActionPayloads[ACTION]
  ): Promise<States>;
  public async dispatch<ACTION extends keyof ActionPayloads>(action: ACTION, payload?: ActionPayloads[ACTION]) {
    return this.mutex.runExclusive(() => {
      this.log(
        "verbose",
        `${this.label}: Dispatch START: Dispatch start state: "${this.state}" performing action "${action as string}"`
      );
      const dispatchStartState = this.state;
      const transition = this.transitions[this.state];
      if (transition === null) {
        // Do nothing. An explicitly null transition means the item cannot be transitioned out of this state.
        this.log(
          "verbose",
          `${this.label}: Dispatch END: No transition for state "${this.state}" for action "${action as string}"`
        );
        return;
      }
      const stateTransition = transition[action] || this.defaultActionHandlers[action];
      if (!stateTransition) {
        throw new Error(`Invalid action ${action as string} for state ${this.state} for ${this.label}`);
      }
      if (typeof stateTransition === "function") {
        try {
          this.state = stateTransition({
            dispatch: this.dispatch.bind(this),
            payload: payload!,
            context: this.context,
            currentState: this.state,
          });
        } catch (e: any) {
          this.log("error", `Error in state transition function for action ${action as string}`, e);
          // Valid state transition function threw an error
          if (this.defaultErrorHandler) {
            this.defaultErrorHandler({
              error: e,
              dispatch: this.dispatchArg,
              context: this.context,
              currentState: this.state,
            });
          }
        }
      } else if (this.isValidState(stateTransition)) {
        this.state = stateTransition;
      } else {
        throw new Error(`Invalid state ${stateTransition} for action ${action as string}`);
      }
      if (dispatchStartState !== this.state) {
        this.emit("stateChanged", this.state);
      }
      this.log(
        "verbose",
        `${this.label}: Dispatch END: Start state: "${dispatchStartState}", end state: "${this.state}" after action "${
          action as string
        }"`
      );
      return this.state;
    });
  }

  isFinalState() {
    return this.finalStates.includes(this.state);
  }

  get currentState() {
    return this.state;
  }
}
