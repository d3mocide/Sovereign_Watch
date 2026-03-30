import { CoTEntity, HistorySegment, NDBCBuoyProperties } from "../../../types";

export interface SourceOpenPayload {
  url: string;
  title: string;
  source?: string;
  pubDate?: string;
}

export interface BaseViewProps {
  entity: CoTEntity;
  onClose: () => void;
  onCenterMap?: () => void;
  onOpenAnalystPanel?: () => void;
  onOpenSource?: (payload: SourceOpenPayload) => void;
}

export interface InfraProperties extends Partial<NDBCBuoyProperties> {
  entity_type?: string;
  id?: string;
  fcc_id?: string;
  tower_type?: string;
  owner?: string;
  height_m?: string | number;
  elevation_m?: string | number;
  source?: string;
  severity?: string | number;
  region?: string;
  country?: string;
  status?: string;
  rfs?: string;
  length_km?: string | number;
  capacity?: string;
  owners?: string;
  datasource?: string;
  landing_points?: string;
  cables?: string;
  // IXP / Facility additions
  ixp_id?: number;
  fac_id?: number;
  name?: string;
  name_long?: string;
  city?: string;
  website?: string;
  org_name?: string;
  layer?: "ixp" | "facility" | string;
  // ISS Tracker additions
  altitude_km?: number;
  velocity_kms?: number;
  timestamp?: number | string;
}

export interface InfraDetail {
  properties?: InfraProperties;
  geometry?: {
    type: string;
  };
}

export interface SatelliteViewProps extends BaseViewProps {
  fetchSatnogsVerification?: (noradId: string) => Promise<any>;
  onPassData?: (
    pass: any,
    nextPassAos?: string,
    nextPassMaxEl?: number,
    satelliteName?: string,
    nextPassDuration?: number,
  ) => void;
}

export interface AircraftViewProps extends BaseViewProps {
  onHistoryLoaded?: (segments: HistorySegment[]) => void;
}
