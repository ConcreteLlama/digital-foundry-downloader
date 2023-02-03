export const stringToDuration = (timeString: string) => {
  //TODO: This is so basic and only works for HH:MM:SS
  const HHMMSS = timeString.split(":");
  let [hours, mins, secs] = HHMMSS.map((val) => parseInt(val));
  if (isNaN(hours) || isNaN(mins) || isNaN(secs)) {
    throw new Error(`Could not parse time ${timeString}`);
  }
  return secs + mins * 60 + hours * 60 * 60;
};

export const secondsToHHMMSS = (durationSeconds: number) => {
  // 🤦‍♂️
  const seconds = (durationSeconds % 60).toString().padStart(2, "0");
  const minutes = Math.floor((durationSeconds % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const hours = Math.floor(durationSeconds / (60 * 60));
  return `${hours}:${minutes}:${seconds}`;
};
