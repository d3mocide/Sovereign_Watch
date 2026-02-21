import { forwardRef, useRef, useEffect } from 'react';
import { Map, useControl, MapRef } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { MapAdapterProps } from './mapAdapterTypes';

function DeckGLOverlay(props: any) {
    const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay(props));

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

const MapLibreAdapter = forwardRef<MapRef, MapAdapterProps>((props, ref) => {
    const { viewState, onMove, onLoad, mapStyle, style, onContextMenu, onClick, globeMode, deckProps } = props;
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
        >
            {/* deck.gl coordinate transforms are Mercator-only; suppress overlay in globe mode */}
            {!globeMode && <DeckGLOverlay {...deckProps} />}
        </Map>
    );
});

MapLibreAdapter.displayName = 'MapLibreAdapter';
export default MapLibreAdapter;
export type { MapRef };
