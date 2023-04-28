export const formatDate = (date: Date, withTime: boolean = true) => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
  };
  if (withTime) {
    options.hour = "numeric";
    options.minute = "numeric";
    options.second = "numeric";
  }
  return date.toLocaleDateString("en-US", options);
};

export const conciseFormatDate = (date: Date) => {
  const options: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  };
  return date.toLocaleDateString("en-US", options);
};
