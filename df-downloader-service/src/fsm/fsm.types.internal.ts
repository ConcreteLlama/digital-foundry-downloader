export type ActionPayloadMap<Actions extends string> = {
  [action in Actions]: any;
};
export type NonPayloadActions<ActionPayloadMap> = {
  [action in keyof ActionPayloadMap]: undefined extends ActionPayloadMap[action] ? action : never;
}[keyof ActionPayloadMap];

export type PayloadActions<ActionPayloadMap> = {
  [action in keyof ActionPayloadMap]: ActionPayloadMap[action] extends undefined ? never : action;
}[keyof ActionPayloadMap];

export type StateEventMap<States extends string> = {
  stateChanged: States;
};
