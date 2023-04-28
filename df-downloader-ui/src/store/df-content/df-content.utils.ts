export const objToUrlParams = (object: any) => {
  const urlParams = new URLSearchParams();
  for (const [key, value] of Object.entries(object)) {
    if (!value) {
      continue;
    }
    if (Array.isArray(value)) {
      urlParams.set(key, value.join(","));
    } else {
      urlParams.set(key, typeof value === "string" ? value : "" + value);
    }
  }
  return urlParams;
};
