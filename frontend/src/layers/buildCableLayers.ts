import { CableLayer } from "./CableLayer";

interface BuildCableLayersOptions {
  cablesData: any;
  landingPointsData: any;
  visible: boolean;
  opacity: number;
  zoom: number;
  onHover: (info: any) => void;
  onClick: (info: any) => void;
}

export function buildCableLayers({
  cablesData,
  landingPointsData,
  visible,
  opacity,
  zoom,
  onHover,
  onClick,
}: BuildCableLayersOptions) {
  if (!visible) return [];

  return [
    new CableLayer({
      id: "submarine-cables",
      cablesData,
      landingPointsData,
      visible,
      opacity,
      zoom,
      onHover,
      onClick,
    }),
  ];
}
