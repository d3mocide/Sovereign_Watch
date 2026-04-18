import type { WebSDRNode } from '../../types';

export const WEBSDR_MODES = ['usb', 'lsb', 'am', 'cw', 'fm'] as const;
export type WebSDRMode = typeof WEBSDR_MODES[number];

function getPageProtocol(): string {
  if (typeof window !== 'undefined' && window.location?.protocol) {
    return window.location.protocol;
  }
  return 'http:';
}

export function tuneParam(freqKhz: number, mode: WebSDRMode): string {
  const freq = freqKhz % 1 === 0 ? String(freqKhz) : freqKhz.toFixed(3);
  return `${freq}${mode}`;
}

export function buildLaunchUrl(
  node: WebSDRNode,
  freqKhz: number,
  mode: WebSDRMode,
): string {
  const base = node.url.endsWith('/') ? node.url : `${node.url}/`;
  return `${base}?tune=${tuneParam(freqKhz, mode)}`;
}

export function buildEmbedUrl(
  node: WebSDRNode,
  freqKhz: number,
  mode: WebSDRMode,
  pageProtocol: string = getPageProtocol(),
): string {
  const launchUrl = new URL(buildLaunchUrl(node, freqKhz, mode));
  if (pageProtocol === 'https:' && launchUrl.protocol === 'http:') {
    launchUrl.protocol = 'https:';
  }
  return launchUrl.toString();
}