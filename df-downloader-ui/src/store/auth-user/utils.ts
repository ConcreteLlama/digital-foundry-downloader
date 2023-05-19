export const makeBasicAuth = (username: string, password: string) => {
  return `Basic ${btoa(`${username}:${password}`)}`;
};
