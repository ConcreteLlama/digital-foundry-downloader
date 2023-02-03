export const commaSeparatedToArray = (csv: any) => {
  if (typeof csv !== "string") {
    return;
  }
  return csv.split(",").map((val) => val.trim());
};
