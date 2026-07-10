import { describe, expect, it } from "vitest";
import type { CoTEntity } from "../types";
import { EntityIconAttributeCache } from "./entityIconAttributes";

function entity(partial: Partial<CoTEntity> & { uid: string }): CoTEntity {
  return {
    lat: 45,
    lon: -122,
    altitude: 1000,
    type: "a-f-A",
    course: 90,
    speed: 100,
    callsign: partial.uid,
    lastSeen: Date.now(),
    trail: [],
    uidHash: 0,
    ...partial,
  } as CoTEntity;
}

describe("EntityIconAttributeCache", () => {
  it("fills position/angle/color/size buffers parallel to the entity array", () => {
    const cache = new EntityIconAttributeCache();
    const entities = [
      entity({ uid: "A", lon: 10, lat: 20, altitude: 300, course: 45 }),
      entity({ uid: "B", lon: -30, lat: -40, altitude: 0, course: 180, type: "a-n-S", speed: 5 }),
    ];
    const { data, shipFlags } = cache.update(entities, null, 1000);

    expect(data.length).toBe(2);
    const pos = data.attributes.getPosition.value;
    expect([pos[0], pos[1], pos[2]]).toEqual([10, 20, 300]);
    expect([pos[3], pos[4], pos[5]]).toEqual([-30, -40, 0]);

    const angles = data.attributes.getAngle.value;
    expect(angles[0]).toBe(-45);
    expect(angles[1]).toBe(-180);

    expect(shipFlags[0]).toBe(0); // aircraft
    expect(shipFlags[1]).toBe(1); // vessel

    // Colors: 4 bytes per entity, opaque-ish alpha from entityColor default
    const colors = data.attributes.getColor.value;
    expect(colors[3]).toBe(220);
    expect(colors[7]).toBe(220);

    const sizes = data.attributes.getSize.value;
    expect(sizes[0]).toBe(32);
    expect(sizes[1]).toBe(32);
  });

  it("ping-pongs the per-frame buffers so references change between updates", () => {
    const cache = new EntityIconAttributeCache();
    const entities = [entity({ uid: "A" })];
    const first = cache.update(entities, null, 1000);
    const second = cache.update(entities, null, 1016);
    expect(second.data.attributes.getPosition.value).not.toBe(
      first.data.attributes.getPosition.value,
    );
    expect(second.data.attributes.getAngle.value).not.toBe(
      first.data.attributes.getAngle.value,
    );
  });

  it("keeps color/size buffer references stable between style refreshes", () => {
    const cache = new EntityIconAttributeCache();
    const entities = [entity({ uid: "A" })];
    const first = cache.update(entities, null, 1000);
    // 16 ms later: same membership, same selection, within the 1 s cadence
    const second = cache.update(entities, null, 1016);
    expect(second.data.attributes.getColor.value).toBe(
      first.data.attributes.getColor.value,
    );
    expect(second.data.attributes.getSize.value).toBe(
      first.data.attributes.getSize.value,
    );
    // Past the cadence → refreshed into the other buffer
    const third = cache.update(entities, null, 2100);
    expect(third.data.attributes.getColor.value).not.toBe(
      second.data.attributes.getColor.value,
    );
  });

  it("refreshes styles immediately when membership changes", () => {
    const cache = new EntityIconAttributeCache();
    const first = cache.update([entity({ uid: "A" })], null, 1000);
    const second = cache.update(
      [entity({ uid: "A" }), entity({ uid: "B", type: "a-n-S" })],
      null,
      1016,
    );
    expect(second.data.length).toBe(2);
    expect(second.data.attributes.getColor.value).not.toBe(
      first.data.attributes.getColor.value,
    );
    expect(second.shipFlags[1]).toBe(1);
  });

  it("applies the enlarged size to the selected entity on selection change", () => {
    const cache = new EntityIconAttributeCache();
    const entities = [entity({ uid: "A" }), entity({ uid: "B" })];
    cache.update(entities, null, 1000);
    const { data } = cache.update(entities, "B", 1016);
    const sizes = data.attributes.getSize.value;
    expect(sizes[0]).toBe(32);
    expect(sizes[1]).toBeCloseTo(41.6);
  });

  it("grows capacity and stays correct when the entity count increases", () => {
    const cache = new EntityIconAttributeCache();
    cache.update([entity({ uid: "A" })], null, 1000);
    const many = Array.from({ length: 100 }, (_, i) =>
      entity({ uid: `E${i}`, lon: i, lat: -i }),
    );
    const { data } = cache.update(many, null, 1016);
    expect(data.length).toBe(100);
    const pos = data.attributes.getPosition.value;
    expect(pos[99 * 3]).toBe(99);
    expect(pos[99 * 3 + 1]).toBe(-99);
    expect(pos.length).toBeGreaterThanOrEqual(100 * 3);
  });
});
