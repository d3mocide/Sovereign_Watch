import { CoTEntity, HistorySegment, NDBCBuoyProperties } from "../../../types";

export interface BaseViewProps {
  entity: CoTEntity;
  onClose: () => void;
  onCenterMap?: () => void;
  onOpenAnalystPanel?: () => void;
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
