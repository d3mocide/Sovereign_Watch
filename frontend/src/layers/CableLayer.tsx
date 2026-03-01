import { CompositeLayer } from '@deck.gl/core';
import { PathLayer, ScatterplotLayer } from '@deck.gl/layers';

export interface CableLayerProps {
  id: string;
  cablesData: any;
  landingPointsData: any;
  visible: boolean;
  opacity: number;
  zoom: number;
  onHover: (info: any) => void;
  onClick: (info: any) => void;
  updateTriggers?: any;
}

export class CableLayer extends CompositeLayer<CableLayerProps> {
  static layerName = 'CableLayer';

  renderLayers() {
    const { id, cablesData, landingPointsData, visible, opacity, zoom, onHover, onClick } = this.props;

    if (!visible || zoom < 3) return [];

    const showCables = zoom >= 6;
    const layers = [];

    // Cables PathLayer
    if (showCables && cablesData) {
      layers.push(
        new PathLayer({
          id: `${id}-cables`,
          data: cablesData.features,
          getPath: (d: any) => d.geometry.coordinates,
          getColor: (d: any) => {
             // Let's assume some status field or default to active
             const status = d.properties.is_planned ? 0 : 1;
             if (status === 0) return [251, 191, 36, Math.floor(255 * opacity)]; // amber (construction)
             return [0, 245, 255, Math.floor(255 * opacity)]; // cyan (active)
          },
          getWidth: 2,
          widthMinPixels: 2,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 220],
          onHover,
          onClick,
          parameters: {
             depthTest: false
          }
        })
      );
    }

    // Landing Points ScatterplotLayer
    if (landingPointsData) {
      layers.push(
        new ScatterplotLayer({
          id: `${id}-landing-points`,
          data: landingPointsData.features,
          getPosition: (d: any) => d.geometry.coordinates,
          getFillColor: [0, 245, 255, Math.floor(255 * opacity)],
          getRadius: 4,
          radiusMinPixels: 4,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255, 255],
          onHover,
          onClick,
          parameters: {
             depthTest: false
          }
        })
      );
    }

    return layers;
  }
}
