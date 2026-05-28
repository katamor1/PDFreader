const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

export function isAllowedBrowserOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return true;
  }

  try {
    const url = new URL(origin);
    const hostname = normalizeHostname(url.hostname);
    return (url.protocol === "http:" || url.protocol === "https:") && LOCAL_HOSTNAMES.has(hostname);
  } catch {
    return false;
  }
}
