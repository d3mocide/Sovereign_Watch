import { describe, it, expect } from 'vitest';
import { processReplayData } from './replayUtils';

describe('processReplayData', () => {
  const mockData = [
    {
      entity_id: 'e1',
      type: 'a-f-G',
      lat: 0,
      lon: 0,
      alt: 0,
      speed: 0,
      heading: 0,
      time: '2023-01-01T10:00:00Z',
      meta: JSON.stringify({ callsign: 'Alpha' })
    },
    {
      entity_id: 'e1',
      type: 'a-f-G',
      lat: 1,
      lon: 1,
      alt: 0,
      speed: 0,
      heading: 0,
      time: '2023-01-01T10:01:00Z',
      meta: JSON.stringify({ callsign: 'Alpha' })
    },
    {
      entity_id: 'e2',
      type: 'a-f-G',
      lat: 2,
      lon: 2,
      alt: 0,
      speed: 0,
      heading: 0,
      time: '2023-01-01T10:00:30Z',
      meta: JSON.stringify({ callsign: 'Bravo' })
    }
  ];

  it('correctly groups data by entity_id', () => {
    const result = processReplayData(mockData);
    expect(result.size).toBe(2);
    expect(result.get('e1')).toHaveLength(2);
    expect(result.get('e2')).toHaveLength(1);
  });

  it('preserves input order (assumes input is sorted)', () => {
    // Since we removed internal sorting, we rely on input order.
    // Let's verify that the output order matches input order for an entity.
    const inputData = [
      mockData[0], // 10:00
      mockData[1], // 10:01
    ];

    const result = processReplayData(inputData);
    const e1 = result.get('e1');
    expect(e1).toBeDefined();
    expect(e1![0].time).toEqual(Date.parse(mockData[0].time));
    expect(e1![1].time).toEqual(Date.parse(mockData[1].time));
  });

  it('maps meta.classification to vesselClassification for ship entities', () => {
    const row = {
      entity_id: '123456789',
      type: 'a-f-S-C-M',
      lat: 47.6,
      lon: -122.3,
      alt: 0,
      speed: 3,
      heading: 90,
      time: '2023-01-01T10:00:00Z',
      meta: JSON.stringify({ callsign: 'MV TEST', classification: { category: 'cargo' } })
    };
    const result = processReplayData([row]);
    const entity = result.get('123456789')![0];
    expect(entity.vesselClassification?.category).toBe('cargo');
    expect(entity.classification).toBeUndefined();
  });

  it('maps meta.classification to classification for aircraft entities', () => {
    const row = {
      entity_id: 'abc123',
      type: 'a-f-A-C-F',
      lat: 47.6,
      lon: -122.3,
      alt: 10000,
      speed: 200,
      heading: 270,
      time: '2023-01-01T10:00:00Z',
      meta: JSON.stringify({
        callsign: 'UAL123',
        classification: { affiliation: 'commercial', platform: 'fixed_wing', category: 'A3' }
      })
    };
    const result = processReplayData([row]);
    const entity = result.get('abc123')![0];
    expect(entity.classification?.affiliation).toBe('commercial');
    expect(entity.classification?.platform).toBe('fixed_wing');
    expect(entity.vesselClassification).toBeUndefined();
  });

  it('handles missing meta.classification gracefully', () => {
    const row = {
      entity_id: 'e99',
      type: 'a-f-S-C-M',
      lat: 0, lon: 0, alt: 0, speed: 0, heading: 0,
      time: '2023-01-01T10:00:00Z',
      meta: JSON.stringify({ callsign: 'UNKNOWN' })
    };
    const result = processReplayData([row]);
    const entity = result.get('e99')![0];
    expect(entity.vesselClassification).toBeUndefined();
    expect(entity.classification).toBeUndefined();
  });

  it('handles large datasets without data loss', () => {
    const largeDataset: any[] = [];
    const numEntities = 100;
    const pointsPerEntity = 100;
    const baseTime = Date.parse('2023-01-01T00:00:00Z');

    for (let i = 0; i < pointsPerEntity; i++) {
      for (let e = 0; e < numEntities; e++) {
        largeDataset.push({
          entity_id: `entity-${e}`,
          type: 'a-f-G',
          lat: 0,
          lon: 0,
          alt: 0,
          speed: 0,
          heading: 0,
          time: new Date(baseTime + i * 1000).toISOString(),
          meta: JSON.stringify({ callsign: `Entity ${e}` })
        });
      }
    }

    const result = processReplayData(largeDataset);
    expect(result.size).toBe(numEntities);
    for (let e = 0; e < numEntities; e++) {
      expect(result.get(`entity-${e}`)).toHaveLength(pointsPerEntity);
    }
  });
});
