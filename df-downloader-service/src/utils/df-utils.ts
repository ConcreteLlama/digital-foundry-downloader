export const sanitizeContentName = (contentNameOrUrl: string) => {
  const slashIdx = contentNameOrUrl.lastIndexOf("/");
  if (slashIdx > 0) {
    return contentNameOrUrl.substring(slashIdx + 1);
  }
  return contentNameOrUrl;
};
