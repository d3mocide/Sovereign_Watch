import { describe, expect, it } from 'vitest';
import type { WebSDRNode } from '../../types';
import { buildEmbedUrl, buildLaunchUrl } from './websdrUrl';

const NODE: WebSDRNode = {
  url: 'http://websdr.sdrutah.org:8901/',
  name: 'Northern Utah WebSDR',
  location: 'Utah, USA',
  lat: 40,
  lon: -111,
  bands: ['hf'],
  freq_min_khz: 0,
  freq_max_khz: 30000,
  users: 1,
  distance_km: 10,
};

describe('WebSDRPanel URL builders', () => {
  it('keeps the launch URL on the receiver\'s original protocol', () => {
    expect(buildLaunchUrl(NODE, 14074, 'usb')).toBe('http://websdr.sdrutah.org:8901/?tune=14074usb');
  });

  it('upgrades insecure iframe URLs on HTTPS pages', () => {
    expect(buildEmbedUrl(NODE, 14074, 'usb', 'https:')).toBe('https://websdr.sdrutah.org:8901/?tune=14074usb');
  });

  it('preserves HTTP iframe URLs on non-HTTPS pages', () => {
    expect(buildEmbedUrl(NODE, 14074, 'usb', 'http:')).toBe('http://websdr.sdrutah.org:8901/?tune=14074usb');
  });
});