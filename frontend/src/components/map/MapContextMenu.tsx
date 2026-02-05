import React, { useState } from 'react';
import { Crosshair, Save, Home, MapPin } from 'lucide-react';

interface MapContextMenuProps {
  position: { x: number; y: number } | null;
  coordinates: { lat: number; lon: number } | null;
  onSetFocus: (lat: number, lon: number) => void;
  onSaveLocation: (lat: number, lon: number) => void;
  onReturnHome: () => void;
  onClose: () => void;
}

export const MapContextMenu: React.FC<MapContextMenuProps> = ({
  position,
  coordinates,
  onSetFocus,
  onSaveLocation,
  onReturnHome,
  onClose,
}) => {
  if (!position || !coordinates) return null;

  const handleSetFocus = () => {
    onSetFocus(coordinates.lat, coordinates.lon);
    onClose();
  };

  const handleSaveLocation = () => {
    onSaveLocation(coordinates.lat, coordinates.lon);
    onClose();
  };

  const handleReturnHome = () => {
    onReturnHome();
    onClose();
  };

  return (
    <>
      {/* Backdrop - clicks close menu */}
      <div
        className="fixed inset-0 z-[999]"
        onClick={onClose}
      />
      
      {/* Context Menu */}
      <div
        className="fixed z-[1000] min-w-[240px] animate-in fade-in-0 zoom-in-95 duration-200"
        style={{ 
          left: `${position.x}px`, 
          top: `${position.y}px`,
        }}
      >
        <div className="border border-hud-green/30 bg-black/90 backdrop-blur-xl rounded shadow-[0_0_20px_rgba(0,255,65,0.15)]">
          {/* Header */}
          <div className="border-b border-hud-green/20 px-3 py-2 bg-gradient-to-b from-hud-green/10 to-transparent">
            <div className="flex items-center gap-2 text-[10px] text-hud-green/60 uppercase font-bold tracking-wider">
              <MapPin size={10} />
              <span>Mission Control</span>
            </div>
            <div className="text-[9px] text-white/40 font-mono tabular-nums mt-0.5">
              {coordinates.lat.toFixed(4)}°, {coordinates.lon.toFixed(4)}°
            </div>
          </div>

          {/* Menu Items */}
          <div className="py-1">
            <button
              onClick={handleSetFocus}
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-hud-green/10 transition-colors group text-left"
            >
              <Crosshair size={14} className="text-hud-green/60 group-hover:text-hud-green" />
              <div>
                <div className="text-xs text-white/90 group-hover:text-white font-medium">Set Focus Here</div>
                <div className="text-[10px] text-white/40">Pivot surveillance to this area</div>
              </div>
            </button>

            <button
              onClick={handleSaveLocation}
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-cyan-500/10 transition-colors group text-left"
            >
              <Save size={14} className="text-cyan-400/60 group-hover:text-cyan-400" />
              <div>
                <div className="text-xs text-white/90 group-hover:text-white font-medium">Save Location As...</div>
                <div className="text-[10px] text-white/40">Add to mission library</div>
              </div>
            </button>

            <div className="border-t border-white/5 my-1" />

            <button
              onClick={handleReturnHome}
              className="w-full px-3 py-2 flex items-center gap-3 hover:bg-white/5 transition-colors group text-left"
            >
              <Home size={14} className="text-white/40 group-hover:text-white/60" />
              <div>
                <div className="text-xs text-white/70 group-hover:text-white font-medium">Return to Home Base</div>
                <div className="text-[10px] text-white/30">Revert to default area</div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </>
  );
};
