import { forwardRef, useRef, useEffect, useMemo } from 'react';
import { Map, useControl, MapRef, AttributionControl } from 'react-map-gl/mapbox';
import type { MapAdapterProps } from './mapAdapterTypes';
import { MapboxOverlay } from '@deck.gl/mapbox';

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

function DeckGLOverlay(props: MapAdapterProps['deckProps']) {
    const { globeMode, ...rest } = props;

    // We pass _full3d so DeckGL enables full 3D perspective matrix synchronization 
    // to match Mapbox's camera. We DO NOT pass `projection` manually because MapboxOverlay
    // auto-detects it and syncs the internal camera FOV specifically for Mapbox.
    const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({ 
        ...rest,
        _full3d: true
    } as any));

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
                } as any);
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
    const { viewState, onMove, onLoad, mapStyle, mapboxAccessToken, style, onContextMenu, onClick, globeMode, showAttribution, deckProps } = props;

    // Mapbox Standard (v3) styling configuration.
    // We use useMemo to ensure that even if BASEMAP_CONFIG is static, 
    // the object reference passed to the `config` prop changes whenever
    // the mapStyle changes. This forces react-map-gl/mapbox to re-trigger
    // setConfigProperty calls on the internal map instance.
    const basemapConfig = useMemo(() => {
        const isStandard = typeof mapStyle === 'string' && mapStyle.includes('standard');
        return isStandard ? { basemap: BASEMAP_CONFIG } : undefined;
    }, [mapStyle]);

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
            attributionControl={false}
            config={basemapConfig}
        >
            {showAttribution !== false && <AttributionControl compact={true} position="bottom-right" />}
            {(() => {
                const { key: deckKey, ...restDeckProps } = deckProps;
                return <DeckGLOverlay key={deckKey as string} {...restDeckProps} />;
            })()}
        </Map>
    );
});

MapboxAdapter.displayName = 'MapboxAdapter';
export default MapboxAdapter;
export type { MapRef };
