const KB = 1000;
const KiB = 1024;
const MB = Math.pow(KB, 2);
const MiB = Math.pow(KiB, 2);
const GB = Math.pow(KB, 3);
const GiB = Math.pow(KiB, 3);
const TB = Math.pow(KB, 4);
const TiB = Math.pow(KiB, 4);
const PB = Math.pow(KB, 5);
const PiB = Math.pow(KiB, 5);

export function getSizeMultiplier(sizeFormat?: string) {
  if (!sizeFormat) {
    return 1;
  }
  sizeFormat = sizeFormat.toLowerCase().trim();
  if (sizeFormat === "b" || sizeFormat === "B") {
    return 1;
  } else if (sizeFormat === "k" || sizeFormat === "kb") {
    return KB;
  } else if (sizeFormat === "kib") {
    return KiB;
  } else if (sizeFormat === "m" || sizeFormat === "mb") {
    return MB;
  } else if (sizeFormat === "mib") {
    return MiB;
  } else if (sizeFormat === "g" || sizeFormat === "gb") {
    return GB;
  } else if (sizeFormat === "gib") {
    return GiB;
  } else if (sizeFormat === "t" || sizeFormat === "tb") {
    return TB;
  } else if (sizeFormat === "tib") {
    return TiB;
  } else if (sizeFormat === "p" || sizeFormat === "pb") {
    return PB;
  } else if (sizeFormat === "pib") {
    return PiB;
  }
  throw new Error(`Cannot determine byte multiplier from ${sizeFormat}`);
}

export function fileSizeStringToBytes(fileSizeString: string) {
  const matchResult = fileSizeString.match(/([0-9]+\.?[0-9]*)\s*([A-Za-z]*)/);
  if (!matchResult || matchResult.length < 1) {
    throw new Error(`Unable to parse size from ${fileSizeString}`);
  }
  const sizeNum = parseFloat(matchResult[1]);
  let sizeMultiplier = 1;
  if (matchResult.length > 1) {
    sizeMultiplier = getSizeMultiplier(matchResult[2]);
  }
  const size = sizeNum * sizeMultiplier;
  return size;
}

const byteThresholds = {
  si: [
    {
      unitValue: 1,
      unit: "B",
    },
    {
      unitValue: KB,
      unit: "kB",
    },
    {
      unitValue: MB,
      unit: "MB",
    },
    {
      unitValue: GB,
      unit: "GB",
    },
    {
      unitValue: TB,
      unit: "TB",
    },
    {
      unitValue: PB,
      unit: "PB",
    },
    {
      unitValue: Number.MAX_SAFE_INTEGER,
      unit: "EB",
    },
  ].map((unit) => {
    return {
      ...unit,
      threshold: unit.unitValue * 1000,
    };
  }),
  iec: [
    {
      unitValue: 1,
      unit: "B",
    },
    {
      unitValue: KiB,
      unit: "KiB",
    },
    {
      unitValue: MiB,
      unit: "MiB",
    },
    {
      unitValue: GiB,
      unit: "GiB",
    },
    {
      unitValue: TiB,
      unit: "TiB",
    },
    {
      unitValue: PiB,
      unit: "PiB",
    },
    {
      unitValue: Number.MAX_SAFE_INTEGER,
      unit: "EiB",
    },
  ].map((unit) => {
    return {
      ...unit,
      threshold: unit.unitValue * 1024,
    };
  }),
};

export const bytesToHumanReadable = (bytes: number, si = false) => {
  const thresholds = si ? byteThresholds.si : byteThresholds.iec;
  for (const threshold of thresholds) {
    if (bytes < threshold.threshold) {
      return `${(bytes / threshold.unitValue).toFixed(2)} ${threshold.unit}`;
    }
  }
  return `${bytes} B`;
};

export const sanitizeFileName = (fileName: string) => {
  return fileName.replace(/[^a-zA-Z0-9-_]/g, "_");
};
