import { ScatterplotLayer } from '@deck.gl/layers';
import type { Layer, PickingInfo } from "@deck.gl/core";
import type { Tower } from '../types';

export const buildTowerLayer = (
    towers: Tower[],
    visible: boolean,
    globeMode: boolean,
    onHover: (info: PickingInfo<Tower>) => void,
    onSelect: (info: PickingInfo<Tower>) => void
): Layer[] => {
    if (!visible || !towers || towers.length === 0) return [];

    return [
        new ScatterplotLayer({
            id: `fcc-towers-layer-${globeMode ? "globe" : "merc"}`,
            data: towers,
            pickable: true,
            opacity: 0.9,
            stroked: true,
            filled: true,
            radiusScale: 1,
            radiusMinPixels: 2,
            radiusMaxPixels: 12,
            lineWidthMinPixels: 1,
            getPosition: (d: Tower) => d.coordinates,
            getFillColor: [249, 115, 22, 200], // Orange-500
            getLineColor: [0, 0, 0, 150],
            wrapLongitude: !globeMode,
            parameters: {
                depthTest: !!globeMode,
                // Using Slot 3-4 transition depthBias (closer than cables, behind entities)
                depthBias: globeMode ? -105.0 : 0
            },
            onHover: (info: PickingInfo<Tower>) => {
                if (info.object) {
                    // Normalize for TacticalMap tooltip
                    onHover({
                        ...info,
                        object: {
                            ...info.object,
                            type: 'infra',
                            properties: {
                                ...info.object,
                                name: `FCC TOWER: ${info.object.fccId || 'Unknown'}`,
                                entity_type: 'infra'
                            }
                        }
                    });
                } else {
                    onHover(info);
                }
            },
            onClick: (info: PickingInfo<Tower>) => {
                if (info.object) {
                    onSelect(info);
                }
            }
        })
    ];
};
