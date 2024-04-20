import { LoggerType } from "../utils/log.js";
import { ActionPayloadMap, NonPayloadActions } from "./fsm.types.internal.js";

export type ActionFunction<
  States extends string,
  ActionPayloads extends ActionPayloadMap<any>,
  Context,
  Action extends keyof ActionPayloads
> = (params: {
  dispatch: AsyncDispatchFn<States, ActionPayloads>;
  payload: ActionPayloads[Action];
  context: Context;
  currentState: States;
}) => States;

export type ActionMap<States extends string, ActionPayloads extends ActionPayloadMap<any>, Context> = Partial<{
  [action in keyof ActionPayloads]: States | ActionFunction<States, ActionPayloads, Context, action>;
}>;

export type StateTransitions<States extends string, ActionPayloads extends ActionPayloadMap<any>, Context> = Record<
  States,
  ActionMap<States, ActionPayloads, Context> | null
>;

export type AsyncDispatchFn<States extends string, ActionPayloads extends ActionPayloadMap<any>> = {
  <ACTION extends NonPayloadActions<ActionPayloads>>(action: ACTION): Promise<States>;
  <ACTION extends keyof ActionPayloads>(action: ACTION, payload: ActionPayloads[ACTION]): Promise<States>;
};

type DefaultExceptionHandlerPayload<States extends string, ActionPayloads extends ActionPayloadMap<any>, Context> = {
  error: any;
  dispatch: AsyncDispatchFn<States, ActionPayloads>;
  context: Context;
  currentState: States;
};
export type DefaultExceptionHandlerFn<States extends string, ActionPayloads extends ActionPayloadMap<any>, Context> = (
  payload: DefaultExceptionHandlerPayload<States, ActionPayloads, Context>
) => void;

export type FsmOpts<States extends string, ActionPayloads extends ActionPayloadMap<any>, Context> = {
  initialState: States;
  logger?: LoggerType;
  finalState?: States | States[];
  transitions: StateTransitions<States, ActionPayloads, Context>;
  defaultActionHandlers?: ActionMap<States, ActionPayloads, Context>;
  context: Context;
  label?: string;
  defaultErrorHandler?: DefaultExceptionHandlerFn<States, ActionPayloads, Context>;
};
