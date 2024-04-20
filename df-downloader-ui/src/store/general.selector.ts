import { RootState } from "./store.ts";

type StatesWithLoadingKeys = {
  [K in keyof RootState]: RootState[K] extends { loading: boolean } ? K : never;
}[keyof RootState];

export const selectIsLoading = (stateKey: StatesWithLoadingKeys) => (state: RootState) => state[stateKey].loading;
