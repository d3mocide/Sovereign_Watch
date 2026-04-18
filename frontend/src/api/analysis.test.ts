import { afterEach, describe, expect, it, vi } from 'vitest';
import { runDomainAnalysis } from './analysis';
import type { CoTEntity } from '../types';

const AIR_ENTITY: CoTEntity = {
  uid: 'air-1',
  lat: 35.5,
  lon: -97.5,
  altitude: 1000,
  type: 'a-f-A',
  course: 90,
  speed: 250,
  callsign: 'TEST01',
  lastSeen: Date.now(),
  trail: [],
  uidHash: 1,
};

describe('runDomainAnalysis', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns an overload advisory when the backend flags the model as overloaded', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          domain: 'air',
          h3_region: '8728f2ba8ffffff',
          risk_score: 0.2,
          narrative: 'Air domain: 0 ADS-B tracks in 24h. No anomalies detected.',
          indicators: [],
          context_snapshot: {},
          ai_status: 'overloaded',
          ai_notice: 'AI model temporarily overloaded. Please try again shortly.',
        }),
      }),
    );

    const result = await runDomainAnalysis(AIR_ENTITY, 24);

    expect(result).not.toBeNull();
    expect(result?.advisory).toBe('AI model temporarily overloaded. Please try again shortly.');
    expect(result?.text).toContain('### AIR DOMAIN ASSESSMENT');
  });
});