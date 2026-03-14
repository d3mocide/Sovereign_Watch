// Structure of the URL hash:
// #lat,lon,zoom,layer1,layer2,...
// Example: #45.5152,-122.6784,9.5,showAir,showSea

interface MissionHashState {
  lat: number | null;
  lon: number | null;
  zoom: number | null;
  activeLayers: string[];
}

export function parseMissionHash(): MissionHashState {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) {
    return { lat: null, lon: null, zoom: null, activeLayers: [] };
  }

  const parts = hash.split(',');
  const lat = parseFloat(parts[0]);
  const lon = parseFloat(parts[1]);
  const zoom = parseFloat(parts[2]);

  const activeLayers = parts.slice(3).filter(Boolean);

  return {
    lat: isNaN(lat) ? null : lat,
    lon: isNaN(lon) ? null : lon,
    zoom: isNaN(zoom) ? null : zoom,
    activeLayers
  };
}

let memoryLat: number | null = null;
let memoryLon: number | null = null;
let memoryZoom: number | null = null;
let memoryLayers: string[] | null = null;

let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

export function updateMissionHash(
  viewState?: { lat: number; lon: number; zoom: number },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filters?: Record<string, any>
) {
  const currentState = parseMissionHash();

  const nextLat = viewState?.lat !== undefined ? viewState.lat : (currentState.lat !== null ? currentState.lat : memoryLat);
  const nextLon = viewState?.lon !== undefined ? viewState.lon : (currentState.lon !== null ? currentState.lon : memoryLon);
  const nextZoom = viewState?.zoom !== undefined ? viewState.zoom : (currentState.zoom !== null ? currentState.zoom : memoryZoom);

  // Re-build active layers
  let nextLayers = currentState.activeLayers;
  if (filters) {
    nextLayers = Object.entries(filters)
      .filter(([key, value]) => value === true && key.startsWith('show'))
      .map(([key]) => key);
    memoryLayers = nextLayers;
  } else if (memoryLayers !== null && nextLayers.length === 0) {
    nextLayers = memoryLayers;
  }

  memoryLat = nextLat;
  memoryLon = nextLon;
  memoryZoom = nextZoom;

  // Only update if we have coordinates
  if (nextLat !== null && nextLon !== null && nextZoom !== null) {
    const newHash = `${nextLat.toFixed(4)},${nextLon.toFixed(4)},${nextZoom.toFixed(2)}${nextLayers.length > 0 ? ',' + nextLayers.join(',') : ''}`;

    // Use replaceState to avoid spamming the browser history
    if (window.location.hash !== `#${newHash}`) {
      if (debounceTimeout) {
        clearTimeout(debounceTimeout);
      }
      debounceTimeout = setTimeout(() => {
        window.history.replaceState(null, '', `#${newHash}`);
      }, 250);
    }
  }
}
