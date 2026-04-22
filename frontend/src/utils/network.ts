function isLocalHostname(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function currentHttpOrigin(): string {
  return window.location.origin;
}

function currentWsOrigin(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}`;
}

function shouldPreferSameOrigin(target: URL): boolean {
  if (isLocalHostname(target.hostname) && !isLocalHostname(window.location.hostname)) {
    return true;
  }

  if (window.location.protocol !== "https:") {
    return false;
  }

  const isInsecureTarget = target.protocol === "http:" || target.protocol === "ws:";
  return isInsecureTarget && target.host !== window.location.host;
}

function normalizePathname(pathname: string, requiredPath: string): string {
  if (!pathname || pathname === "/") {
    return requiredPath;
  }

  return pathname.endsWith(requiredPath) ? pathname : `${pathname.replace(/\/$/, "")}${requiredPath}`;
}

export function resolveHttpUrl(envUrl: string | undefined, requiredPath: string): string {
  if (!envUrl) {
    return `${currentHttpOrigin()}${requiredPath}`;
  }

  let target: URL;
  try {
    target = new URL(envUrl, currentHttpOrigin());
  } catch {
    return `${currentHttpOrigin()}${requiredPath}`;
  }

  if (shouldPreferSameOrigin(target)) {
    return `${currentHttpOrigin()}${requiredPath}`;
  }

  if (window.location.protocol === "https:" && target.protocol === "http:" && target.host === window.location.host) {
    target.protocol = "https:";
  }

  target.pathname = normalizePathname(target.pathname, requiredPath);
  return target.toString();
}

function appendToken(urlStr: string, token?: string | null): string {
  if (!token) return urlStr;
  try {
    const url = new URL(urlStr);
    url.searchParams.set("token", token);
    return url.toString();
  } catch {
    return urlStr;
  }
}

export function resolveWebSocketUrl(envUrl: string | undefined, requiredPath: string, token?: string | null): string {
  if (!envUrl) {
    return appendToken(`${currentWsOrigin()}${requiredPath}`, token);
  }

  let target: URL;
  try {
    target = new URL(envUrl, currentHttpOrigin());
  } catch {
    return appendToken(`${currentWsOrigin()}${requiredPath}`, token);
  }

  if (shouldPreferSameOrigin(target)) {
    return appendToken(`${currentWsOrigin()}${requiredPath}`, token);
  }

  if (target.protocol === "http:" || target.protocol === "https:") {
    target.protocol = target.protocol === "https:" ? "wss:" : "ws:";
  }

  if (window.location.protocol === "https:" && target.protocol === "ws:" && target.host === window.location.host) {
    target.protocol = "wss:";
  }

  target.pathname = normalizePathname(target.pathname, requiredPath);
  return appendToken(target.toString(), token);
}