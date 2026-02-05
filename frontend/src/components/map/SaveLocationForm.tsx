import React, { useState } from 'react';
import { X, MapPin, Target } from 'lucide-react';

interface SaveLocationFormProps {
  coordinates: { lat: number; lon: number } | null;
  onSave: (name: string, radius: number) => void;
  onCancel: () => void;
}

export const SaveLocationForm: React.FC<SaveLocationFormProps> = ({
  coordinates,
  onSave,
  onCancel,
}) => {
  const [name, setName] = useState('');
  const [radius, setRadius] = useState('150');
  const [error, setError] = useState('');

  if (!coordinates) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    
    const radiusNum = parseInt(radius);
    if (isNaN(radiusNum) || radiusNum < 10 || radiusNum > 300) {
      setError('Radius must be between 10 and 300 nm');
      return;
    }
    
    onSave(name.trim(), radiusNum);
  };

  return (
    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-80 bg-black/90 backdrop-blur-xl border border-hud-green/30 rounded-lg shadow-2xl">
      <div className="bg-gradient-to-r from-hud-green/20 to-transparent p-3 border-b border-hud-green/20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin size={16} className="text-hud-green" />
            <h3 className="text-sm font-bold text-hud-green uppercase tracking-wider">
              Save Location
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="text-white/40 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* Coordinates Display */}
        <div className="bg-white/5 rounded p-2 border border-white/10">
          <div className="flex items-center gap-2 text-[10px] text-white/60 mb-1">
            <Target size={10} />
            <span>Coordinates</span>
          </div>
          <div className="text-xs text-white/90 font-mono">
            {coordinates.lat.toFixed(4)}°, {coordinates.lon.toFixed(4)}°
          </div>
        </div>

        {/* Name Input */}
        <div>
          <label className="block text-[10px] text-white/60 mb-1.5 uppercase tracking-wide">
            Location Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            placeholder="e.g., Portland Metro"
            className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-hud-green/50 focus:bg-white/15 transition-all"
            autoFocus
          />
        </div>

        {/* Radius Input */}
        <div>
          <label className="block text-[10px] text-white/60 mb-1.5 uppercase tracking-wide">
            Coverage Radius (nm)
          </label>
          <input
            type="number"
            value={radius}
            onChange={(e) => {
              setRadius(e.target.value);
              setError('');
            }}
            min="10"
            max="300"
            className="w-full bg-white/10 border border-white/20 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-hud-green/50 focus:bg-white/15 transition-all"
          />
          <div className="text-[9px] text-white/40 mt-1">
            Min: 10nm • Max: 300nm
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-500/20 border border-red-500/50 rounded p-2 text-[11px] text-red-200">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            className="flex-1 bg-hud-green/20 hover:bg-hud-green/30 border border-hud-green/50 text-hud-green text-sm font-medium py-2 rounded transition-all hover:shadow-lg hover:shadow-hud-green/20"
          >
            Save Location
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 bg-white/5 hover:bg-white/10 border border-white/20 text-white/60 hover:text-white text-sm py-2 rounded transition-all"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};
