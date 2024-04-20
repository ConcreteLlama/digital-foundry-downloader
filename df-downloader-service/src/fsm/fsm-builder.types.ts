import { LoggerType } from "../utils/log.js";
import { ActionPayloadMap } from "./fsm.types.internal.js";
import { ActionMap, DefaultExceptionHandlerFn, StateTransitions } from "./fsm.types.js";

export type FsmBuilderOpts<States extends string, ActionPayloads extends ActionPayloadMap<any>, Context> = {
  initialState: States;
  logger?: LoggerType;
  label?: string;
  finalState?: States | States[];
  transitions: StateTransitions<States, ActionPayloads, Context>;
  defaultActionHandlers?: ActionMap<States, ActionPayloads, Context>;
  defaultExceptionHandler?: DefaultExceptionHandlerFn<States, ActionPayloads, Context>;
};

export type FSMBuilderFnOpts = {
  logger?: LoggerType;
  label?: string;
};

export type FSMBuilderFn<FSMType, Context> = Context extends undefined
  ? (context?: any, opts?: FSMBuilderFnOpts) => FSMType
  : (context: Context, opts?: FSMBuilderFnOpts) => FSMType;
