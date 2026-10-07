import { useMapContainerResize } from "../../hooks/useMapContainerResize";
import { useRenderPixelRatio } from "../../hooks/useRenderPixelRatio";
import { MapboxOverlay } from "@deck.gl/mapbox";
// CSS lives with the adapter so only the selected map library's styles are
// loaded — the lazy chunk for the unused adapter (and its CSS) never downloads.
import "maplibre-gl/dist/maplibre-gl.css";
import type { CustomLayerInterface, StyleSpecification } from "maplibre-gl";
import { forwardRef, useEffect, useRef } from "react";
import {
  AttributionControl,
  Map,
  MapRef,
  useControl,
} from "react-map-gl/maplibre";
import type { MapAdapterProps } from "./mapAdapterTypes";

/**
 * Terminal custom layer that clears MapLibre's stencil buffer immediately
 * after all tile/fill/line layers have rendered and before the `render`
 * event fires — which is when deck.gl's afterRender() draws its overlay.
 *
 * Why this is needed even with interleaved:false
 * ─────────────────────────────────────────────
 * MapLibre writes reference values into the stencil buffer while rendering
 * tile layers (used for anti-overlap masking).  Because WebGL stencil state
 * is global to the context, those marks persist when deck.gl begins its own
 * render pass.  ArcLayer is especially vulnerable: its geometry is slightly
 * elevated off the surface, so the stencil masks set by tile boundaries can
 * completely occlude individual arcs at certain zoom / pitch combinations.
 *
 * Clearing the stencil here does NOT affect MapLibre's own rendering — all
 * MapLibre layers have already finished drawing at this point.
 */
const STENCIL_CLEAR_LAYER: CustomLayerInterface = {
  id: "__deck_stencil_reset",
  type: "custom",
  renderingMode: "2d",
  render(gl) {
    gl.disable(gl.STENCIL_TEST);
    gl.stencilMask(0xff);
    gl.clear(gl.STENCIL_BUFFER_BIT);
  },
};

function DeckGLOverlay(props: MapAdapterProps["deckProps"]) {
  const renderPixelRatio = useRenderPixelRatio();
  // Strip globeMode — MapboxOverlay detects globe projection automatically
  // via getDefaultView(map) which returns GlobeView when the map is in globe mode.
  // Both projection and _full3d are managed internally on every map `render` event.
  const { globeMode, ...rest } = props;
  void globeMode;

  const overlay = useControl<MapboxOverlay>(
    () =>
      new MapboxOverlay({
        ...rest,
        useDevicePixels: renderPixelRatio,
        // Disable interleaved rendering to bypass MapLibre's depth buffer occlusion
        interleaved: false,
        // _full3d reads the Mapbox depth buffer to occlude globe far-side layers.
        // Globe view (GlobeView vs MapView) is auto-detected via getDefaultView(map).
        // Since Maplibre's globe depth buffer has issues with objects near the surface, keep this false.
        _full3d: false,
      } as any),
  );

  const isDeadRef = useRef(false);
  useEffect(() => {
    isDeadRef.current = false;
    return () => {
      isDeadRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (overlay && overlay.setProps && !isDeadRef.current) {
      try {
        overlay.setProps({
          ...rest,
        useDevicePixels: renderPixelRatio,
          interleaved: false,
          _full3d: false,
        } as any);
      } catch {
        console.debug("[DeckGLOverlay] Transitioning props...");
      }
    }
  }, [rest, overlay, renderPixelRatio]);

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
  const {
    viewState,
    imperativeCamera = false,
    onMove,
    onLoad,
    mapStyle,
    style,
    onContextMenu,
    onClick,
    globeMode,
    showAttribution,
    deckProps,
  } = props;
  const observeMapResize = useMapContainerResize();
  const nativeMapRef = useRef<MapRef | null>(null);
  useEffect(() => {
    if (imperativeCamera) nativeMapRef.current?.jumpTo({ center: [viewState.longitude, viewState.latitude], zoom: viewState.zoom, pitch: viewState.pitch, bearing: viewState.bearing });
  }, [imperativeCamera, viewState]);
  return (
    <Map
      ref={(instance) => {
        nativeMapRef.current = instance;
        if (typeof ref === "function") ref(instance);
        else if (ref) ref.current = instance;
      }}
      canvasContextAttributes={{ antialias: true }}
      onLoad={(e) => {
        const map = e.target;
        observeMapResize(map);
        const globeCapableMap = map as typeof map & {
          setAtmosphere?: (value: unknown) => void;
          setFog?: (value: unknown) => void;
          setGlobe?: (value: unknown) => void;
        };

        if (globeMode) {
          try {
            // MapLibre versions differ: prefer setAtmosphere, fallback to setFog.
            if (typeof globeCapableMap.setAtmosphere === "function") {
              globeCapableMap.setAtmosphere(null);
            } else if (typeof globeCapableMap.setFog === "function") {
              globeCapableMap.setFog(null);
            }

            if (typeof globeCapableMap.setGlobe === "function") {
              globeCapableMap.setGlobe({ "show-atmosphere": false });
            }
          } catch (err) {
            console.warn(
              "[MapLibreAdapter] Failed to disable atmosphere:",
              err,
            );
          }
        }

        // Inject stencil-clearing layer at the top of the stack so it runs
        // after all MapLibre tile layers and before deck.gl's render pass.
        try {
          if (!map.getLayer(STENCIL_CLEAR_LAYER.id)) {
            map.addLayer(STENCIL_CLEAR_LAYER);
          }
        } catch (err) {
          console.warn(
            "[MapLibreAdapter] Could not add stencil clear layer:",
            err,
          );
        }

        if (onLoad) onLoad(e);
      }}
      {...(imperativeCamera ? { initialViewState: viewState } : viewState)}
      onMove={onMove}
      mapStyle={mapStyle as string | StyleSpecification}
      style={style}
      onContextMenu={onContextMenu}
      onClick={onClick}
      projection={globeMode ? { type: "globe" } : { type: "mercator" }}
      attributionControl={false}
    >
      {showAttribution !== false && (
        <AttributionControl compact={true} position="bottom-right" />
      )}
      {(() => {
        const { key: deckKey, ...restDeckProps } = deckProps;
        return <DeckGLOverlay key={deckKey as string} {...restDeckProps} />;
      })()}
    </Map>
  );
});

MapLibreAdapter.displayName = "MapLibreAdapter";
export default MapLibreAdapter;
export type { MapRef };
