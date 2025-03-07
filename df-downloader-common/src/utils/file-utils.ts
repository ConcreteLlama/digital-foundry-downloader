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

export type BytesToHumanReadableOptions = {
  si?: boolean;
  unitGap?: boolean;
  decimalPlaces?: number;
};
export const bytesToHumanReadable = (bytes: number, opts: BytesToHumanReadableOptions = {}) => {
  const { si = false, unitGap = true, decimalPlaces = 2 } = opts;
  const thresholds = si ? byteThresholds.si : byteThresholds.iec;
  for (const threshold of thresholds) {
    if (bytes < threshold.threshold) {
      return `${(bytes / threshold.unitValue).toFixed(decimalPlaces)}${unitGap ? ' ' : ''}${threshold.unit}`;
    }
  }
  return `${bytes} B`;
};

// Characters that are not allowed
const invalidChars = /[<>:"/\\|?*\x00-\x1F]/g;
// Windows reserved names (these are not allowed as filenames). They can be part of a filename but not the whole filename.
const reservedNames = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

export const commonReplacements: Replacement[] = [
  // Replace all quote types (', `, ") and commas
  [/[`'",]/g, ''],
  // replace newlines
  [/\r\n/g, ' '],
  [/\r/g, ' '],
  [/\n/g, ' '],
]

export const oldSanitizeFileName = (fileName: string) => {
  return fileName.replace(/[^a-zA-Z0-9-_]/g, "_");
};

type Replacement = (string | [RegExp | string, string]);
export type SanitizeFilenameOptions = {
  additionalReplacemenets?: Replacement[];
};
export const sanitizeFilename = (filename: string, opts: SanitizeFilenameOptions = {}) => {
  const { additionalReplacemenets } = opts;
  let sanitized = filename;
  if (additionalReplacemenets) {
      for (const replacement of additionalReplacemenets) {
        if (typeof replacement === "string") {
          sanitized = sanitized.replace(replacement, "_");
        } else {
          sanitized = sanitized.replace(replacement[0], replacement[1]);
        }
      }
  }
  sanitized = sanitized.replace(invalidChars, "_");
  if (reservedNames.test(sanitized)) {
    sanitized = "_" + sanitized;
  }
  // Trim any leading/trailing whitespace and dots
  sanitized = sanitized.trim().replace(/^\.+/, "").replace(/\.+$/, "");
  return sanitized;
};
export const sanitizeFilePath = (filePath: string, opts: SanitizeFilenameOptions = {}) => {
  const parts = filePath.split(/([\\/])/); // Split by / or \ and keep the separators
  let sanitizedPath = '';
  for (let i = 0; i < parts.length; i += 2) {
    const part = parts[i];
    const separator = parts[i + 1] || '';
    sanitizedPath += sanitizeFilename(part, opts) + separator;
  }

  return sanitizedPath;
};

/** Checks if a filename is safe. Thows */
export const testFilename = (filename: string, noThrow: boolean = false) => {
  if (invalidChars.test(filename)) {
    if (noThrow) {
      return false;
    }
    throw new Error("Invalid characters in filename");
  }
  if (reservedNames.test(filename)) {
    if (noThrow) {
      return false;
    }
    throw new Error("Filename is a reserved name in Windows and may cause issues");
  }
  return true;
}

export const testFilePath = (filePath: string, noThrow: boolean = false) => {
  return filePath.split(/\/|\\/).every((part) => testFilename(part, noThrow));
}