import { forwardRef, useRef, useEffect } from 'react';
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
    const { globeMode, ...rest } = props;

    // We pass _full3d so DeckGL enables full 3D perspective matrix synchronization 
    // to match Mapbox's camera. We DO NOT pass `projection` manually because MapboxOverlay
    // auto-detects it and syncs the internal camera FOV specifically for Mapbox.
    const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ 
        ...rest,
        _full3d: true
    }));

    const isDeadRef = useRef(false);
    useEffect(() => {
        isDeadRef.current = false;
        return () => { isDeadRef.current = true; };
    }, []);

    // The official DeckGL pattern: call setProps(props) on every render so that
    // layer changes and other non-camera props flow through correctly.
    useEffect(() => {
        if (overlay && overlay.setProps && !isDeadRef.current) {
            try {
                overlay.setProps({ 
                    ...rest,
                    _full3d: true
                });
            } catch (e) {
                console.debug('[DeckGLOverlay] Transitioning props...');
            }
        }
    }, [rest, globeMode, overlay]);

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
    const { viewState, onMove, onLoad, mapStyle, mapboxAccessToken, style, onContextMenu, onClick, globeMode, deckProps, showTraffic } = props;

    return (
        <Map
            ref={ref}
            onLoad={onLoad}
            initialViewState={viewState}
            onMove={onMove}
            mapStyle={mapStyle}
            mapboxAccessToken={mapboxAccessToken}
            style={style}
            onContextMenu={onContextMenu}
            onClick={onClick}
            antialias={true}
            projection={globeMode ? 'globe' : 'mercator'}
            // Apply Standard Style config at init time to eliminate visual flash
            config={{
                basemap: {
                    ...BASEMAP_CONFIG,
                    showTraffic: !!showTraffic
                }
            }}
        >
            {(() => {
                const { key: deckKey, ...restDeckProps } = (deckProps as any);
                return <DeckGLOverlay key={deckKey} {...restDeckProps} />;
            })()}
        </Map>
    );
});

MapboxAdapter.displayName = 'MapboxAdapter';
export default MapboxAdapter;
export type { MapRef };
