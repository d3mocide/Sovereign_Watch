import React, { useState, useEffect, useCallback } from 'react';
import { Server, X, Copy, Check, Plane, Ship, Globe, XCircle, Save, Download, Upload, Trash2, Eye, Plus, Loader2 } from 'lucide-react';
import { getWatchlist, addToWatchlist, removeFromWatchlist, WatchlistEntry } from '../../api/watchlist';

interface SystemSettingsWidgetProps {
    isOpen: boolean;
    onClose: () => void;
    filters: Record<string, boolean | string | number | string[]>;
    onFilterChange: (key: string, value: boolean | string | number | string[]) => void;
}

export const SystemSettingsWidget: React.FC<SystemSettingsWidgetProps> = ({
    isOpen,
    onClose,
    filters,
    onFilterChange
}) => {
    const [copiedUrl, setCopiedUrl] = useState(false);
    const [presetName, setPresetName] = useState('');

    // --- Watchlist state ---
    const [watchlist, setWatchlist] = useState<WatchlistEntry[]>([]);
    const [watchlistLoading, setWatchlistLoading] = useState(false);
    const [watchlistError, setWatchlistError] = useState<string | null>(null);
    const [newIcao24, setNewIcao24] = useState('');
    const [addLoading, setAddLoading] = useState(false);

    const fetchWatchlist = useCallback(async () => {
        setWatchlistLoading(true);
        setWatchlistError(null);
        try {
            setWatchlist(await getWatchlist());
        } catch {
            setWatchlistError('Failed to load watchlist');
        } finally {
            setWatchlistLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) fetchWatchlist();
    }, [isOpen, fetchWatchlist]);

    const handleAddIcao24 = async () => {
        const icao = newIcao24.trim().toLowerCase();
        if (!icao) return;
        setAddLoading(true);
        setWatchlistError(null);
        try {
            await addToWatchlist(icao);
            setNewIcao24('');
            await fetchWatchlist();
        } catch (e) {
            setWatchlistError(e instanceof Error ? e.message : 'Failed to add');
        } finally {
            setAddLoading(false);
        }
    };

    const handleRemoveIcao24 = async (icao24: string) => {
        setWatchlistError(null);
        try {
            await removeFromWatchlist(icao24);
            setWatchlist((prev) => prev.filter((e) => e.icao24 !== icao24));
        } catch (e) {
            setWatchlistError(e instanceof Error ? e.message : 'Failed to remove');
        }
    };

    // Load custom presets from localStorage
    const loadCustomPresets = () => {
        try {
            const saved = localStorage.getItem('sovereignCustomPresets');
            return saved ? JSON.parse(saved) : {};
        } catch {
            return {};
        }
    };

    const [customPresets, setCustomPresets] = useState<Record<string, Record<string, any>>>(loadCustomPresets());

    if (!isOpen) return null;

    const handleSaveCustomPreset = () => {
        if (!presetName.trim()) return;

        const newPresets = {
            ...customPresets,
            [presetName.trim()]: { ...filters }
        };

        setCustomPresets(newPresets);
        localStorage.setItem('sovereignCustomPresets', JSON.stringify(newPresets));
        setPresetName('');
    };

    const applyCustomPreset = (name: string) => {
        const preset = customPresets[name];
        if (!preset) return;

        Object.keys(preset).forEach(key => {
            if (filters[key] !== preset[key]) {
                onFilterChange(key, preset[key]);
            }
        });
    };

    const deleteCustomPreset = (name: string, e: React.MouseEvent) => {
        e.stopPropagation();
        const newPresets = { ...customPresets };
        delete newPresets[name];
        setCustomPresets(newPresets);
        localStorage.setItem('sovereignCustomPresets', JSON.stringify(newPresets));
    };

    const handleExportPresets = () => {
        const dataStr = JSON.stringify(customPresets, null, 2);
        const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);

        const exportFileDefaultName = 'sovereign-presets.json';

        const linkElement = document.createElement('a');
        linkElement.setAttribute('href', dataUri);
        linkElement.setAttribute('download', exportFileDefaultName);
        linkElement.click();
    };

    const handleImportPresets = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const importedData = JSON.parse(event.target?.result as string);

                // Simple validation to ensure it looks like a preset object
                if (typeof importedData === 'object' && !Array.isArray(importedData)) {
                    // Merge imported presets with existing ones
                    const newPresets = { ...customPresets, ...importedData };
                    setCustomPresets(newPresets);
                    localStorage.setItem('sovereignCustomPresets', JSON.stringify(newPresets));
                } else {
                    console.error("Invalid preset file format");
                    alert("Invalid preset file format. Expected a JSON object.");
                }
            } catch (err) {
                console.error("Failed to parse imported JSON", err);
                alert("Failed to parse imported JSON.");
            }

            // Reset the file input so the same file can be imported again if needed
            e.target.value = '';
        };
        reader.readAsText(file);
    };

    const handleCopyUrl = async () => {
        try {
            await navigator.clipboard.writeText(window.location.href);
            setCopiedUrl(true);
            setTimeout(() => setCopiedUrl(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    const applyPreset = (presetType: 'air' | 'sea' | 'all' | 'clear') => {
        // Base keys we want to reset to false
        const allKeys = [
            'showAir', 'showHelicopter', 'showCommercial', 'showPrivate', 'showMilitary', 'showGovernment', 'showCargo', 'showTanker', 'showPassenger', 'showFishing', 'showSeaMilitary', 'showLawEnforcement', 'showSar', 'showTug', 'showPleasure', 'showHsc', 'showPilot', 'showSpecial', 'showDrone',
            'showSea',
            'showSatellites', 'showSatGPS', 'showSatWeather', 'showSatComms', 'showSatSurveillance', 'showSatOther', 'showConstellation_Starlink',
            'showRepeaters', 'showHam', 'showNoaa', 'showPublicSafety',
            'showCables', 'showLandingStations', 'showOutages'
        ];

        // Object holding the new state for all boolean toggles
        const newFilters: Record<string, boolean> = {};

        // Default: set everything false initially
        allKeys.forEach(k => { newFilters[k] = false; });

        if (presetType === 'air') {
            newFilters.showAir = true;
            newFilters.showHelicopter = true;
            newFilters.showCommercial = true;
            newFilters.showPrivate = true;
            newFilters.showMilitary = true;
            newFilters.showGovernment = true;
            newFilters.showDrone = true;
        } else if (presetType === 'sea') {
            newFilters.showSea = true;
            newFilters.showCargo = true;
            newFilters.showTanker = true;
            newFilters.showPassenger = true;
            newFilters.showFishing = true;
            newFilters.showSeaMilitary = true;
            newFilters.showLawEnforcement = true;
            newFilters.showSar = true;
            newFilters.showTug = true;
            newFilters.showPleasure = true;
            newFilters.showHsc = true;
            newFilters.showPilot = true;
            newFilters.showSpecial = true;
        } else if (presetType === 'all') {
            allKeys.forEach(k => { newFilters[k] = true; });
        }
        // If 'clear', they remain false.

        // Dispatch updates
        Object.keys(newFilters).forEach(key => {
            if (filters[key] !== newFilters[key]) {
                onFilterChange(key, newFilters[key]);
            }
        });
    };

    return (
        <div
            className="absolute top-[calc(100%+20px)] left-1/2 -translate-x-1/2 z-[100] w-[320px] animate-in slide-in-from-top-2 fade-in duration-200"
            onClick={(e) => e.stopPropagation()} // Prevent bubbling up to the toggle button
            role="dialog"
            aria-label="System Settings"
        >
            <div className="bg-black/90 backdrop-blur-xl border border-hud-green/30 rounded-lg shadow-xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-3 py-2 border-b border-hud-green/20 bg-hud-green/10">
                    <div className="flex items-center gap-2">
                        <Server size={14} className="text-hud-green drop-shadow-[0_0_8px_rgba(0,255,65,0.8)]" />
                        <h3 className="text-[10px] font-black tracking-widest text-hud-green drop-shadow-[0_0_5px_rgba(0,255,65,0.5)] uppercase">
                            SYSTEM SETTINGS
                        </h3>
                    </div>
                    <button
                        onClick={(e) => { e.stopPropagation(); onClose(); }}
                        className="p-1 rounded-md text-white/50 hover:text-white hover:bg-white/10 transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                    >
                        <X size={12} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex flex-col gap-3 p-3">

                    {/* Mission State & Presets */}
                    <div className="flex flex-col gap-2">
                        <span className="text-[9px] font-bold text-white/40 tracking-widest px-1 mb-0.5">MISSION STATE & PRESETS</span>

                        {/* Share URL */}
                        <button
                            onClick={handleCopyUrl}
                            className="flex items-center justify-center gap-2 w-full py-1.5 px-3 rounded border border-hud-green/30 bg-hud-green/10 hover:bg-hud-green/20 transition-colors text-hud-green focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                        >
                            {copiedUrl ? (
                                <>
                                    <Check size={12} />
                                    <span className="text-[10px] font-bold tracking-widest">COPIED TO CLIPBOARD!</span>
                                </>
                            ) : (
                                <>
                                    <Copy size={12} />
                                    <span className="text-[10px] font-bold tracking-widest">SHARE MISSION URL</span>
                                </>
                            )}
                        </button>

                        {/* Quick Presets Grid */}
                        <div className="grid grid-cols-2 gap-1.5 mt-1">
                            <button
                                onClick={() => applyPreset('air')}
                                className="flex items-center gap-1.5 p-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                            >
                                <Plane size={12} className="text-air-accent" />
                                <span className="text-[9px] font-bold tracking-wider">AIR ONLY</span>
                            </button>
                            <button
                                onClick={() => applyPreset('sea')}
                                className="flex items-center gap-1.5 p-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                            >
                                <Ship size={12} className="text-sea-accent" />
                                <span className="text-[9px] font-bold tracking-wider">SEA ONLY</span>
                            </button>
                            <button
                                onClick={() => applyPreset('all')}
                                className="flex items-center gap-1.5 p-1.5 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                            >
                                <Globe size={12} className="text-purple-400" />
                                <span className="text-[9px] font-bold tracking-wider">ALL INTELLIGENCE</span>
                            </button>
                            <button
                                onClick={() => applyPreset('clear')}
                                className="flex items-center gap-1.5 p-1.5 rounded border border-alert-red/30 bg-alert-red/10 hover:bg-alert-red/20 transition-colors text-alert-red focus-visible:ring-1 focus-visible:ring-alert-red outline-none"
                            >
                                <XCircle size={12} />
                                <span className="text-[9px] font-bold tracking-wider">CLEAR ALL</span>
                            </button>
                        </div>

                        {/* Custom Presets Section */}
                        <div className="flex flex-col gap-1.5 mt-2">
                            <span className="text-[9px] font-bold text-white/40 tracking-widest px-1">CUSTOM PRESETS</span>

                            {/* Save Input */}
                            <div className="flex gap-1.5">
                                <input
                                    type="text"
                                    placeholder="PRESET NAME..."
                                    value={presetName}
                                    onChange={(e) => setPresetName(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveCustomPreset();
                                    }}
                                    className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white placeholder-white/20 focus:outline-none focus:border-hud-green/50 focus:ring-1 focus:ring-hud-green/50"
                                />
                                <button
                                    onClick={handleSaveCustomPreset}
                                    disabled={!presetName.trim()}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded bg-hud-green/10 border border-hud-green/30 text-hud-green hover:bg-hud-green/20 disabled:opacity-30 disabled:hover:bg-hud-green/10 transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                                >
                                    <Save size={12} />
                                    <span className="text-[9px] font-bold tracking-wider">SAVE</span>
                                </button>
                            </div>

                            {/* Custom Presets List */}
                            {Object.keys(customPresets).length > 0 && (
                                <div className="flex flex-col gap-1 mt-1 max-h-[120px] overflow-y-auto pr-1 custom-scrollbar">
                                    {Object.entries(customPresets).map(([name]) => (
                                        <div key={name} className="flex items-center justify-between rounded border border-white/5 bg-white/5 hover:bg-white/10 group transition-colors">
                                            <button
                                                onClick={() => applyCustomPreset(name)}
                                                className="flex-1 text-left px-2 py-1.5 text-[10px] font-bold tracking-widest text-white/70 group-hover:text-white truncate outline-none focus-visible:ring-1 focus-visible:ring-hud-green"
                                            >
                                                {name}
                                            </button>
                                            <button
                                                onClick={(e) => deleteCustomPreset(name, e)}
                                                className="p-1.5 text-alert-red/50 hover:text-alert-red hover:bg-alert-red/10 rounded-r transition-colors outline-none focus-visible:ring-1 focus-visible:ring-alert-red"
                                                title="Delete Preset"
                                            >
                                                <Trash2 size={12} />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Export / Import Data Portability */}
                            <div className="flex items-center gap-1.5 mt-1 pt-1.5 border-t border-white/5">
                                <button
                                    onClick={handleExportPresets}
                                    disabled={Object.keys(customPresets).length === 0}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10 disabled:opacity-30 disabled:hover:bg-white/5 transition-colors text-white/70 hover:text-white focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                                >
                                    <Download size={10} />
                                    <span className="text-[9px] font-bold tracking-wider">EXPORT JSON</span>
                                </button>

                                <label className="flex-1 flex items-center justify-center gap-1.5 py-1 rounded border border-white/10 bg-white/5 hover:bg-white/10 transition-colors text-white/70 hover:text-white cursor-pointer focus-within:ring-1 focus-within:ring-hud-green outline-none">
                                    <Upload size={10} />
                                    <span className="text-[9px] font-bold tracking-wider">IMPORT JSON</span>
                                    <input
                                        type="file"
                                        accept=".json"
                                        className="sr-only"
                                        onChange={handleImportPresets}
                                    />
                                </label>
                            </div>

                        </div>
                    </div>

                    <div className="h-px w-full bg-hud-green/10" />

                    {/* H3 Coverage Toggle */}
                    <div className="flex flex-col gap-1">
                        <span className="text-[9px] font-bold text-white/40 tracking-widest px-1 mb-0.5">VISUALIZERS</span>
                        <label className={`group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showH3Coverage === true ? 'border-hud-green/20 bg-hud-green/5' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-hud-green/60">⬡</span>
                                <span className={`text-[9px] font-bold tracking-wide ${filters.showH3Coverage === true ? 'text-hud-green/80' : 'text-white/40'}`}>H3 POLLER MESH</span>
                            </div>
                            <input
                                type="checkbox"
                                className="sr-only"
                                checked={filters.showH3Coverage === true}
                                onChange={(e) => onFilterChange('showH3Coverage', e.target.checked)}
                            />
                            <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showH3Coverage === true ? 'bg-hud-green/80' : 'bg-white/10'}`}>
                                <div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showH3Coverage === true ? 'left-2.5' : 'left-0.5'}`} />
                            </div>
                        </label>
                    </div>

                    <div className="h-px w-full bg-hud-green/10" />

                    {/* Global Watchlist */}
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between px-1">
                            <div className="flex items-center gap-1.5">
                                <Eye size={11} className="text-hud-green/70" />
                                <span className="text-[9px] font-bold text-white/40 tracking-widest">GLOBAL WATCHLIST</span>
                            </div>
                            {watchlistLoading && <Loader2 size={10} className="text-hud-green/50 animate-spin" />}
                        </div>

                        {/* Add ICAO24 input */}
                        <div className="flex gap-1.5">
                            <input
                                type="text"
                                maxLength={6}
                                placeholder="ICAO24 HEX..."
                                value={newIcao24}
                                onChange={(e) => setNewIcao24(e.target.value.toLowerCase().replace(/[^0-9a-f]/g, ''))}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleAddIcao24(); }}
                                className="flex-1 bg-black/50 border border-white/10 rounded px-2 py-1 text-[10px] font-mono text-white placeholder-white/20 focus:outline-none focus:border-hud-green/50 focus:ring-1 focus:ring-hud-green/50 uppercase"
                            />
                            <button
                                onClick={handleAddIcao24}
                                disabled={newIcao24.length !== 6 || addLoading}
                                className="flex items-center gap-1 px-2.5 py-1 rounded bg-hud-green/10 border border-hud-green/30 text-hud-green hover:bg-hud-green/20 disabled:opacity-30 disabled:hover:bg-hud-green/10 transition-colors focus-visible:ring-1 focus-visible:ring-hud-green outline-none"
                                title="Add to watchlist (permanent)"
                            >
                                {addLoading ? <Loader2 size={11} className="animate-spin" /> : <Plus size={11} />}
                                <span className="text-[9px] font-bold tracking-wider">ADD</span>
                            </button>
                        </div>

                        {/* Error */}
                        {watchlistError && (
                            <p className="text-[9px] text-alert-red/80 px-1 font-mono">{watchlistError}</p>
                        )}

                        {/* Watchlist entries */}
                        {watchlist.length > 0 ? (
                            <div className="flex flex-col gap-1 max-h-[130px] overflow-y-auto pr-1 custom-scrollbar">
                                {watchlist.map((entry) => (
                                    <div
                                        key={entry.icao24}
                                        className="flex items-center justify-between rounded border border-hud-green/10 bg-hud-green/5 group"
                                    >
                                        <div className="flex flex-col px-2 py-1 min-w-0">
                                            <span className="text-[10px] font-mono font-bold text-hud-green/90 uppercase tracking-wider">
                                                {entry.icao24}
                                            </span>
                                            <span className="text-[8px] text-white/30 tracking-wide">
                                                {entry.permanent
                                                    ? 'PERMANENT'
                                                    : entry.expires_at
                                                        ? `EXP ${new Date(entry.expires_at).toLocaleDateString()}`
                                                        : ''}
                                            </span>
                                        </div>
                                        <button
                                            onClick={() => handleRemoveIcao24(entry.icao24)}
                                            className="p-1.5 text-alert-red/40 hover:text-alert-red hover:bg-alert-red/10 rounded-r transition-colors outline-none focus-visible:ring-1 focus-visible:ring-alert-red"
                                            title="Remove from watchlist"
                                        >
                                            <Trash2 size={11} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            !watchlistLoading && (
                                <p className="text-[9px] text-white/20 px-1 italic">No entries — aircraft added here are tracked globally.</p>
                            )
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
