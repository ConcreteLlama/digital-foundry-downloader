/**
 * Turns a fetch failure into something the person configuring this can act on.
 *
 * Node's fetch throws a bare "fetch failed" and hides the real reason on
 * `cause`, which is useless in a settings dialog - it does not distinguish a
 * typo in the URL from a server that is switched off from a container that
 * cannot see the host. The underlying code does, so dig it out and say it.
 */
export const describeConnectionError = (e: any, url: string): string => {
  const code = e?.cause?.code ?? e?.code;
  switch (code) {
    case "ECONNREFUSED":
      return `Nothing is listening at ${url}. Check the address and port, and that the server is running.`;
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return `Could not resolve the host in ${url}. Check the address - if this app runs in a container, it may not be able to see a name your desktop can.`;
    case "ETIMEDOUT":
    case "UND_ERR_CONNECT_TIMEOUT":
      return `Timed out connecting to ${url}. It is usually a firewall, or the wrong port.`;
    case "ECONNRESET":
      return `The connection to ${url} was reset. If the server uses HTTPS, make sure the URL says https.`;
    case "CERT_HAS_EXPIRED":
    case "DEPTH_ZERO_SELF_SIGNED_CERT":
    case "SELF_SIGNED_CERT_IN_CHAIN":
      return `The certificate at ${url} was rejected (${code}). A self-signed certificate will not be trusted.`;
    default:
      break;
  }
  if (e?.name === "TimeoutError" || e?.name === "AbortError") {
    return `Timed out waiting for ${url} to respond.`;
  }
  const message = String(e?.message ?? e);
  return message === "fetch failed" ? `Could not reach ${url}.` : message;
};
