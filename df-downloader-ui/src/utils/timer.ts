export const setIntervalImmediate = (fn: Function, time: number) => {
  fn();
  return setInterval(fn, time);
};
