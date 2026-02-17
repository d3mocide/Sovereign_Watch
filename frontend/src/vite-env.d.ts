/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_MAPBOX_TOKEN: string;
  readonly VITE_CENTER_LAT: string;
  readonly VITE_CENTER_LON: string;
  readonly VITE_COVERAGE_RADIUS_NM: string;
  readonly VITE_ENABLE_3D_TERRAIN: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
