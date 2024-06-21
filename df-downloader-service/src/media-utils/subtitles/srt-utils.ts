export type SrtTimestamp = {
  hours: number;
  minutes: number;
  seconds: number;
  milliseconds: number;
};

export const isSrtTimestamp = (timestamp: any): timestamp is SrtTimestamp => {
  if (!timestamp) {
    return false;
  }
  if (typeof timestamp !== "object") {
    return false;
  }
  return (
    typeof timestamp.hours === "number" &&
    typeof timestamp.minutes === "number" &&
    typeof timestamp.seconds === "number" &&
    typeof timestamp.milliseconds === "number"
  );
};

export const millisecondsToSrtTimestamp = (ms: number): SrtTimestamp => {
  const hours = Math.floor(ms / 3600000);
  ms -= hours * 3600000;
  const minutes = Math.floor(ms / 60000);
  ms -= minutes * 60000;
  const seconds = Math.floor(ms / 1000);
  ms -= seconds * 1000;
  return {
    hours,
    minutes,
    seconds,
    milliseconds: Math.floor(ms),
  };
};

export const secondsToSrtTimestamp = (seconds: number): SrtTimestamp => {
  return millisecondsToSrtTimestamp(seconds * 1000);
};

export const ensureSrtTimestamp = (timestamp: number | SrtTimestamp): SrtTimestamp => {
  if (isSrtTimestamp(timestamp)) {
    return timestamp;
  }
  return secondsToSrtTimestamp(timestamp);
};

export const srtTimestampToMilliseconds = (timestamp: SrtTimestamp): number => {
  return timestamp.hours * 3600000 + timestamp.minutes * 60000 + timestamp.seconds * 1000 + timestamp.milliseconds;
};

/**
 * Represents a single line in an SRT file (without the index; that's handled by the array index)
 */
export type SrtLine = {
  start: SrtTimestamp;
  end: SrtTimestamp;
  transcript: string;
};

const createSrtTimestampString = (timestamp: SrtTimestamp): string => {
  const hours = timestamp.hours.toString().padStart(2, "0");
  const minutes = timestamp.minutes.toString().padStart(2, "0");
  const seconds = timestamp.seconds.toString().padStart(2, "0");
  const milliseconds = timestamp.milliseconds.toString().padStart(3, "0").substring(0, 3);
  return `${hours}:${minutes}:${seconds},${milliseconds}`;
};

export const generateSrt = (lines: SrtLine[]): string => {
  return lines
    .sort((a, b) => {
      const aStart = srtTimestampToMilliseconds(a.start);
      const bStart = srtTimestampToMilliseconds(b.start);
      return aStart - bStart;
    })
    .map((line, idx) => {
      return `${idx + 1}\n${createSrtTimestampString(line.start)} --> ${createSrtTimestampString(line.end)}\n${
        line.transcript
      }\n`;
    })
    .join("\n");
};

export const languageToSubsLanguage = (language: string): string => {
  if (language === "en") {
    return "eng";
  }
  return language;
};
