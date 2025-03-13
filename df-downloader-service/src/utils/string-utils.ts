export const commaSeparatedToArray = (csv: any) => {
  if (typeof csv !== "string") {
    return;
  }
  return csv.split(",").map((val) => val.trim());
};

export const mediaSanitise = (data: string) => {
  return data.replace(/\n/gi, " ").replace(/[^a-z0-9  ,\\.!\\-\\[\\]\\?]/gi, "");
};
