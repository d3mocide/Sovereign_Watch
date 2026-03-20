import type { CSSProperties } from 'react';
import type { Layer } from '@deck.gl/core';
import type { MapboxOverlay } from '@deck.gl/mapbox';

export interface MapAdapterProps {
    viewState: Record<string, number>;
    onMove?: (evt: unknown) => void;
    onLoad?: (evt: unknown) => void;
    mapStyle: string;
    style: CSSProperties;
    onContextMenu?: (evt: unknown) => void;
    onClick?: () => void;
    globeMode?: boolean;
    deckProps: {
        id: string;
        interleaved?: boolean;
        onOverlayLoaded?: (overlay: MapboxOverlay | null) => void;
        key?: string;
        globeMode?: boolean;
        layers?: Layer[];
        [key: string]: unknown;
    };
}
