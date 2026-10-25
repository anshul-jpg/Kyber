/**
 * Helper to construct the base HTTP/HTTPS API URL from the active companion connection settings.
 * Defaults cleanly to window.location.hostname or 127.0.0.1 without hardcoded personal IPs.
 */
export function getApiBaseUrl(host?: string, port?: string | number, isSsl?: boolean): string {
  let hostname = (host || '').trim();
  if (!hostname && typeof window !== 'undefined' && window.location.hostname) {
    hostname = window.location.hostname;
  }
  if (!hostname || hostname === 'localhost') {
    hostname = '127.0.0.1';
  }

  // Strip protocol if included
  hostname = hostname.replace(/^https?:\/\//, '').split(':')[0];

  const ssl = isSsl ?? (typeof window !== 'undefined' && window.location.protocol === 'https:');
  const scheme = ssl ? 'https' : 'http';
  
  const rawPort = port !== undefined && port !== null ? String(port).trim() : '';
  const targetPort = !rawPort || rawPort === '443' ? (ssl ? 443 : 4040) : Number(rawPort);

  if ((ssl && targetPort === 443) || (!ssl && targetPort === 80)) {
    return `${scheme}://${hostname}`;
  }

  return `${scheme}://${hostname}:${targetPort}`;
}
