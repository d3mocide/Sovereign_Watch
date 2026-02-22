import { forwardRef, useRef, useEffect, useCallback } from 'react';
import { Map, useControl, MapRef } from 'react-map-gl/mapbox';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { MapAdapterProps } from './mapAdapterTypes';

// Mapbox Standard Style config applied via imperative API (react-map-gl v8 removed the `config` prop)
const BASEMAP_CONFIG: Record<string, boolean | string> = {
    lightPreset: 'night',
    theme: 'monochrome',
    showPointOfInterestLabels: false,
    showRoadLabels: false,
    showPedestrianRoads: false,
    showPlaceLabels: true,
    showTransitLabels: true,
};

function DeckGLOverlay(props: any) {
    const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ ...props, interleaved: false }));

    const isDeadRef = useRef(false);
    useEffect(() => {
        isDeadRef.current = false;
        return () => { isDeadRef.current = true; };
    }, []);

    useEffect(() => {
        if (overlay && overlay.setProps && !isDeadRef.current) {
            try {
                overlay.setProps(props);
            } catch (e) {
                console.debug('[DeckGLOverlay] Transitioning props...');
            }
        }
    }, [props, overlay]);

    const { onOverlayLoaded } = props;
    useEffect(() => {
        if (onOverlayLoaded && overlay) {
            onOverlayLoaded(overlay);
        }
        return () => {
            if (onOverlayLoaded) onOverlayLoaded(null);
        };
    }, [overlay, onOverlayLoaded]);

    return null;
}

const MapboxAdapter = forwardRef<MapRef, MapAdapterProps & { mapboxAccessToken?: string }>((props, ref) => {
    const { viewState, onMove, onLoad, mapStyle, mapboxAccessToken, style, onContextMenu, onClick, globeMode, deckProps } = props;

    const handleLoad = useCallback((evt: any) => {
        const map = evt.target?.getMap?.() ?? evt.target;
        if (map && typeof map.setConfigProperty === 'function') {
            Object.entries(BASEMAP_CONFIG).forEach(([key, value]) => {
                map.setConfigProperty('basemap', key, value);
            });
        }
        onLoad(evt);
    }, [onLoad]);

    return (
        <Map
            ref={ref}
            onLoad={handleLoad}
            {...viewState}
            onMove={onMove}
            mapStyle={mapStyle}
            mapboxAccessToken={mapboxAccessToken}
            style={style}
            onContextMenu={onContextMenu}
            onClick={onClick}
            antialias={true}
        >
            <DeckGLOverlay {...deckProps} />
        </Map>
    );
});

MapboxAdapter.displayName = 'MapboxAdapter';
export default MapboxAdapter;
export type { MapRef };
