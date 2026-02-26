import { forwardRef, useRef, useEffect } from 'react';
import { Map, useControl, MapRef } from 'react-map-gl/maplibre';
import { MapboxOverlay } from '@deck.gl/mapbox';
import type { MapAdapterProps } from './mapAdapterTypes';

function DeckGLOverlay(props: any) {
    const { globeMode, ...rest } = props;
    const projection = globeMode ? 'globe' : 'mercator';

    // Key-based construction is handled by parent, but we ensure parameters are fresh
    const overlay = useControl<MapboxOverlay>(() => new MapboxOverlay({
        ...rest,
        projection,
        // _full3d is a DeckGL v9 experimental prop that builds an explicit depth buffer 
        // to handle non-interleaved overlay occlusion properly on globes.
        _full3d: true
    }));

    const isDeadRef = useRef(false);
    useEffect(() => {
        isDeadRef.current = false;
        return () => { isDeadRef.current = true; };
    }, []);

    useEffect(() => {
        if (overlay && overlay.setProps && !isDeadRef.current) {
            try {
                // Critical: Explicitly update projection along with other props
                overlay.setProps({ ...rest, projection });
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
            antialias={true}
            projection={globeMode ? { type: 'globe' } : { type: 'mercator' }}
        >
            {(() => {
                const { key: deckKey, ...restDeckProps } = (deckProps as any);
                return <DeckGLOverlay key={deckKey} {...restDeckProps} />;
            })()}
        </Map>
    );
});

MapLibreAdapter.displayName = 'MapLibreAdapter';
export default MapLibreAdapter;
export type { MapRef };
