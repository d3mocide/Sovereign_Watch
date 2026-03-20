import { ScatterplotLayer } from '@deck.gl/layers';

type TowerRecord = {
    id: string;
    fccId?: string;
    type?: string;
    owner?: string;
    status?: string;
    heightM?: number;
    elevationM?: number;
    coordinates: [number, number];
};

type TowerPickInfo = {
    object?: TowerRecord;
    coordinate?: [number, number];
    x?: number;
    y?: number;
};

const normalizeTowerInfo = (info: TowerPickInfo): TowerPickInfo => {
    const tower = info?.object;
    if (!tower) return info;

    const coordinates = Array.isArray(tower.coordinates) ? tower.coordinates : info.coordinate ?? [0, 0];
    const properties = {
        id: tower.id,
        name: `FCC TOWER: ${tower.fccId || 'UNKNOWN'}`,
        entity_type: 'tower',
        fcc_id: tower.fccId,
        tower_type: tower.type,
        owner: tower.owner,
        status: tower.status,
        height_m: tower.heightM,
        elevation_m: tower.elevationM,
        source: 'FCC'
    };

    return {
        ...info,
        object: {
            id: tower.id,
            type: 'tower',
            geometry: {
                type: 'Point',
                coordinates
            },
            properties
        }
    };
};

export const buildTowerLayer = (
    towers: TowerRecord[],
    visible: boolean,
    globeMode: boolean,
    onHover: (info: TowerPickInfo) => void,
    onSelect: (info: TowerPickInfo) => void
) => {
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
            getPosition: (d: TowerRecord) => d.coordinates,
            getFillColor: [249, 115, 22, 200], // Orange-500
            getLineColor: [0, 0, 0, 150],
            wrapLongitude: !globeMode,
            parameters: {
                depthTest: !!globeMode,
                // Using Slot 3-4 transition depthBias (closer than cables, behind entities)
                depthBias: globeMode ? -105.0 : 0
            },
            onHover: (info: TowerPickInfo) => {
                onHover(normalizeTowerInfo(info));
            },
            onClick: (info: TowerPickInfo) => {
                if (info.object) {
                    onSelect(normalizeTowerInfo(info));
                }
            }
        })
    ];
};
