import { CoTEntity } from "../types";

/** Returns 'sea', 'air', or null (=skip) based on entity type and active filters. */
export function filterEntity(
  entity: CoTEntity,
  filters: any,
): 'sea' | 'air' | null {
  const isShip = entity.type?.includes('S');
  if (isShip) {
    if (!filters?.showSea) return null;
    if (entity.vesselClassification) {
      const cat = entity.vesselClassification.category;
      if (cat === 'cargo' && filters?.showCargo === false) return null;
      if (cat === 'tanker' && filters?.showTanker === false) return null;
      if (cat === 'passenger' && filters?.showPassenger === false) return null;
      if (cat === 'fishing' && filters?.showFishing === false) return null;
      if (cat === 'military' && filters?.showSeaMilitary === false) return null;
      if (cat === 'law_enforcement' && filters?.showLawEnforcement === false) return null;
      if (cat === 'sar' && filters?.showSar === false) return null;
      if (cat === 'tug' && filters?.showTug === false) return null;
      if (cat === 'pleasure' && filters?.showPleasure === false) return null;
      if (cat === 'hsc' && filters?.showHsc === false) return null;
      if (cat === 'pilot' && filters?.showPilot === false) return null;
      if ((cat === 'special' || cat === 'unknown') && filters?.showSpecial === false) return null;
    }
    return 'sea';
  } else {
    if (!filters?.showAir) return null;
    if (entity.classification) {
      const cls = entity.classification;

      // Platform overrides for specific asset types
      if (cls.platform === 'helicopter') {
        return filters?.showHelicopter !== false ? 'air' : null;
      }
      if (cls.platform === 'drone' || cls.platform === 'uav') {
        return filters?.showDrone !== false ? 'air' : null;
      }

      // Affiliation filters for general tracks
      if (cls.affiliation === 'military' && filters?.showMilitary === false) return null;
      if (cls.affiliation === 'government' && filters?.showGovernment === false) return null;
      if (cls.affiliation === 'commercial' && filters?.showCommercial === false) return null;
      if (cls.affiliation === 'general_aviation' && filters?.showPrivate === false) return null;
    }
    return 'air';
  }
}

/** Returns true if the satellite should be visible given the current filters. */
export function filterSatellite(
  sat: CoTEntity,
  filters: any,
): boolean {
  if (!filters?.showSatellites) return false;
  const constellation = sat.detail?.constellation as string | undefined;
  if (constellation && filters?.[`showConstellation_${constellation}`] === false) return false;
  const cat = (sat.detail?.category as string)?.toLowerCase() || '';
  if (cat.includes('gps') || cat.includes('gnss') || cat.includes('galileo') ||
      cat.includes('beidou') || cat.includes('glonass')) {
    return filters.showSatGPS !== false;
  }
  if (cat.includes('weather') || cat.includes('noaa') || cat.includes('meteosat') ||
      cat.includes('fengYun')) {
    return filters.showSatWeather !== false;
  }
  if (cat.includes('comms') || cat.includes('communications') || cat.includes('starlink') ||
      cat.includes('iridium') || cat.includes('oneweb') || cat.includes('intelsat')) {
    return filters.showSatComms !== false;
  }
  if (cat.includes('surveillance') || cat.includes('military') || cat.includes('isr') ||
      cat.includes('intel') || cat.includes('earth observation') || cat.includes('imaging')) {
    return filters.showSatSurveillance !== false;
  }
  return filters.showSatOther !== false;
}
