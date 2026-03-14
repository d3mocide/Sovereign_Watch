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
    expect(e1![0].time).toEqual(new Date(mockData[0].time).getTime());
    expect(e1![1].time).toEqual(new Date(mockData[1].time).getTime());
  });

  it('handles large datasets without data loss', () => {
    const largeDataset: any[] = [];
    const numEntities = 100;
    const pointsPerEntity = 100;
    const baseTime = new Date('2023-01-01T00:00:00Z').getTime();

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
