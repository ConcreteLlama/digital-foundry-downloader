import { FSMBuilderFn, FSMBuilderFnOpts, FsmBuilderOpts } from "./fsm-builder.types.js";
import { FSM } from "./fsm.js";
import { ActionPayloadMap } from "./fsm.types.internal.js";

export const FSMBuilder = <States extends string, ActionPayloads extends ActionPayloadMap<any>, Context>({
  initialState,
  finalState,
  transitions,
  label,
  logger,
  defaultActionHandlers,
  defaultExceptionHandler,
}: FsmBuilderOpts<States, ActionPayloads, Context>) => {
  defaultActionHandlers = defaultActionHandlers || {};
  const finalStates =
    (typeof finalState === "string" && [finalState]) ||
    (Array.isArray(finalState) && finalState) ||
    Object.entries(transitions).reduce((finalStates, [state, actions]) => {
      if (actions === null) {
        finalStates.push(state as States);
      }
      return finalStates;
    }, [] as States[]);
  return ((context: Context, opts?: FSMBuilderFnOpts) =>
    new FSM<States, ActionPayloads, Context>({
      initialState: initialState,
      finalState: finalStates,
      transitions: transitions,
      label: opts?.label || label,
      logger: opts?.logger || logger,
      defaultActionHandlers: defaultActionHandlers,
      context,
      defaultErrorHandler: defaultExceptionHandler,
    })) as FSMBuilderFn<FSM<States, ActionPayloads, Context>, Context>;
};
