export const stringToDuration = (timeString: string) => {
  //TODO: This is so basic and only works for HH:MM:SS
  const HHMMSS = timeString.split(":");
  let [hours, mins, secs] = HHMMSS.map((val) => parseInt(val));
  if (isNaN(hours) || isNaN(mins) || isNaN(secs)) {
    throw new Error(`Could not parse time ${timeString}`);
  }
  return secs + mins * 60 + hours * 60 * 60;
};

export const secondsToHMS = (durationSeconds: number) => {
  // 🤦‍♂️
  const seconds = durationSeconds % 60;
  const minutes = Math.floor((durationSeconds % 3600) / 60);
  const hours = Math.floor(durationSeconds / (60 * 60));
  return {
    hours,
    minutes,
    seconds,
  };
};

export const secondsToHHMMSS = (durationSeconds: number) => {
  // 🤦‍♂️
  // TODO: Make this less stupid, more versatile, maybe just use a library
  const { hours, minutes, seconds } = secondsToHMS(durationSeconds);
  const hh = hours.toString().padStart(2, "0");
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
};
