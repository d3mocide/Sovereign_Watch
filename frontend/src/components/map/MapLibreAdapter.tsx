import { forwardRef, useRef, useEffect } from 'react';
import { Map, useControl, MapRef, AttributionControl } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { MapAdapterProps } from './mapAdapterTypes';

function DeckGLOverlay(props: MapAdapterProps['deckProps']) {
    // Strip globeMode — MapboxOverlay detects globe projection automatically
    // via getDefaultView(map) which returns GlobeView when the map is in globe mode.
    // Both projection and _full3d are managed internally on every map `render` event.
    const { globeMode: _globeMode, ...rest } = props;

    const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({
        ...rest,
        // _full3d reads the Mapbox depth buffer to occlude globe far-side layers.
        // Globe view (GlobeView vs MapView) is auto-detected via getDefaultView(map).
        // Since Maplibre's globe depth buffer has issues with objects near the surface, keep this false.
        _full3d: false
    } as any));

    const isDeadRef = useRef(false);
    useEffect(() => {
        isDeadRef.current = false;
        return () => { isDeadRef.current = true; };
    }, []);

    useEffect(() => {
        if (overlay && overlay.setProps && !isDeadRef.current) {
            try {
                overlay.setProps({ ...rest, _full3d: false } as any);
            } catch (e) {
                console.debug('[DeckGLOverlay] Transitioning props...');
            }
        }
    }, [rest, overlay]);

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

const MapLibreAdapter = forwardRef<MapRef, MapAdapterProps>((props, ref) => {
    const { viewState, onMove, onLoad, mapStyle, style, onContextMenu, onClick, globeMode, showAttribution, deckProps } = props;
    return (
        <Map
            ref={ref}
            onLoad={onLoad}
            {...viewState}
            onMove={onMove}
            mapStyle={mapStyle}
            style={style}
            onContextMenu={onContextMenu}
            onClick={onClick}
            projection={globeMode ? { type: 'globe' } : { type: 'mercator' }}
            attributionControl={false}
        >
            {showAttribution !== false && <AttributionControl compact={true} position="bottom-right" />}
            {(() => {
                const { key: deckKey, ...restDeckProps } = deckProps;
                return <DeckGLOverlay key={deckKey as string} {...restDeckProps} />;
            })()}
        </Map>
    );
});

MapLibreAdapter.displayName = 'MapLibreAdapter';
export default MapLibreAdapter;
export type { MapRef };
