import React, { useState, useEffect, useCallback } from 'react';
import { Search, X, Plane, Ship, Clock, History } from 'lucide-react';
import { CoTEntity, MapActions } from '../../types';

interface SearchWidgetProps {
    mapActions: MapActions;
    onEntitySelect: (entity: CoTEntity) => void;
}

interface SearchResult {
    uid: string;
    callsign: string;
    type: string;
    lat: number;
    lon: number;
    isLive: boolean;
    lastSeen: number;
    entity?: CoTEntity; // For live entities
    classification?: { affiliation?: string; platform?: string; operator?: string; icaoType?: string };
    vesselClassification?: import('../../types').VesselClassification;
}

export const SHIP_TYPE_MAP: Record<number, string> = {
    30: 'Fishing vessel',
    35: 'Military operations',
    37: 'Pleasure craft',
    52: 'Tug',
    55: 'Law enforcement',
    60: 'Passenger ship',
    70: 'Cargo ship',
    80: 'Tanker'
};

export const SearchWidget: React.FC<SearchWidgetProps> = ({ mapActions, onEntitySelect }) => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [debouncedQuery, setDebouncedQuery] = useState('');

    // Debounce input
    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedQuery(query);
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    // Perform Search
    useEffect(() => {
        if (!debouncedQuery || debouncedQuery.length < 2) {
            setResults([]);
            return;
        }

        const performSearch = async () => {
            setLoading(true);
            const combinedResults: SearchResult[] = [];
            const seenUids = new Set<string>();

            // 1. Local Live Search
            const localMatches = mapActions.searchLocal(debouncedQuery);
            localMatches.forEach((entity: CoTEntity) => {
                combinedResults.push({
                    uid: entity.uid,
                    callsign: entity.callsign || entity.uid,
                    type: entity.type,
                    lat: entity.lat,
                    lon: entity.lon,
                    isLive: true,
                    lastSeen: entity.lastSeen,
                    entity: entity,
                    classification: entity.classification,
                    vesselClassification: entity.vesselClassification
                });
                seenUids.add(entity.uid);
            });

            // 2. API History Search
            try {
                const response = await fetch(`/api/tracks/search?q=${encodeURIComponent(debouncedQuery)}&limit=10`);
                if (response.ok) {
                    const historyMatches = await response.json();
                    
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    historyMatches.forEach((item: any) => {
                        // Only add if not already found in live results
                        if (!seenUids.has(item.entity_id)) {
                             // Backend returns 'time' or 'last_seen'? 
                             // Schema said "time as last_seen".
                             // Let's assume the API returns what we defined: entity_id, type, last_seen, lat, lon
                             // Need to parse timestamp properly.
                             const ts = new Date(item.last_seen).getTime();
                             
                             combinedResults.push({
                                 uid: item.entity_id,
                                 callsign: item.callsign || item.entity_id,
                                 type: item.type,
                                 lat: item.lat,
                                 lon: item.lon,
                                 isLive: false,
                                 lastSeen: ts,
                                 classification: item.classification,
                                 vesselClassification: item.vesselClassification
                             });
                        }
                    });
                }
            } catch (err) {
                console.warn("History search failed:", err);
            }

            setResults(combinedResults);
            setLoading(false);
        };

        performSearch();
    }, [debouncedQuery, mapActions]);

    // Live Refresh Effect
    useEffect(() => {
       if (!debouncedQuery || debouncedQuery.length < 2 || results.length === 0) return;

       const refreshInterval = setInterval(() => {
           const localMatches = mapActions.searchLocal(debouncedQuery);

           setResults(prev => prev.map((result: SearchResult) => {
               if (!result.isLive) return result;
               const updated = localMatches.find(e => e.uid === result.uid);
               if (updated) {
                   return {
                       ...result,
                       lat: updated.lat,
                       lon: updated.lon,
                       lastSeen: updated.lastSeen,
                       entity: updated,
                   };
               }
               return result;
           }));
       }, 2000);

       return () => clearInterval(refreshInterval);
    }, [debouncedQuery, results.length, mapActions]);

    const handleSelect = (result: SearchResult) => {
        if (result.isLive && result.entity) {
            onEntitySelect(result.entity);
            mapActions.flyTo(result.lat, result.lon, 12);
        } else {
            // For historical, just fly to location
            mapActions.flyTo(result.lat, result.lon, 12);
        }
        // Optional: clear search on select?
        // setQuery(''); 
    };

    const getIcon = (type: string, isLive: boolean) => {
        const isShip = type.includes('S');
        const className = isLive ? "text-hud-green" : "text-white/40";
        if (isShip) return <Ship size={14} className={className} />;
        return <Plane size={14} className={className} />;
    };

    const formatTimeAgo = (ts: number) => {
        const seconds = Math.floor((Date.now() - ts) / 1000);
        if (seconds < 60) return `${seconds}s ago`;
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
        return `${Math.floor(seconds / 3600)}h ago`;
    };

    return (
        <div className="relative group z-50">
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search size={14} className="text-cyan-400/60" />
                </div>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search Callsign / UID..."
                    className="w-full bg-black/40 backdrop-blur-md border border-hud-green/30 rounded pl-9 pr-8 py-2 text-sm text-cyan-400 placeholder-cyan-400/30 focus:outline-none focus:border-cyan-400/60 focus:bg-black/60 transition-all font-mono uppercase"
                />
                {query && (
                    <button
                        onClick={() => setQuery('')}
                        className="absolute inset-y-0 right-0 pr-2 flex items-center text-white/20 hover:text-white/60 transition-colors"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Results Dropdown */}
            {(results.length > 0 || (query && loading)) && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-black/90 backdrop-blur-xl border border-white/10 rounded shadow-2xl max-h-60 overflow-y-auto custom-scrollbar">
                    {loading && results.length === 0 && (
                        <div className="p-2 text-xs text-white/40 text-center font-mono">Searching...</div>
                    )}
                    
                    {results.map((result) => (
                        <button
                            key={result.uid}
                            onClick={() => handleSelect(result)}
                            className="w-full text-left flex items-center gap-3 p-2 hover:bg-white/10 transition-colors border-b border-white/5 last:border-0"
                        >
                            <div className="flex-shrink-0">
                                {getIcon(result.type, result.isLive)}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-bold text-white/90 font-mono truncate">
                                        {result.callsign}
                                    </span>
                                    {!result.isLive && (
                                        <span className="text-[10px] bg-white/10 px-1 rounded text-white/40">
                                            HIST
                                        </span>
                                    )}
                                    {result.type.includes('S') && result.vesselClassification?.category && (
                                        <span className={`w-2 h-2 rounded-full ${
                                            result.vesselClassification.category === 'cargo' ? 'bg-green-500' :
                                            result.vesselClassification.category === 'tanker' ? 'bg-red-500' :
                                            result.vesselClassification.category === 'passenger' ? 'bg-purple-500' :
                                            result.vesselClassification.category === 'military' ? 'bg-amber-500' :
                                            'bg-blue-400'
                                        }`} title={result.vesselClassification.category.toUpperCase()}></span>
                                    )}
                                    {!result.type.includes('S') && result.classification?.affiliation && (
                                        <span className={`text-[9px] px-1 rounded font-bold ${
                                            result.classification.affiliation === 'military' ? 'text-amber-500 bg-amber-500/10' :
                                            result.classification.affiliation === 'government' ? 'text-blue-400 bg-blue-400/10' :
                                            'text-white/40 bg-white/5'
                                        }`}>
                                            {result.classification.affiliation.slice(0,3).toUpperCase()}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-white/40 font-mono mt-0.5">
                                    {result.type.includes('S') && result.vesselClassification ? (
                                        <>
                                            <span className="text-white/60 truncate max-w-[100px]">{SHIP_TYPE_MAP[result.vesselClassification.shipType || 0] || 'Vessel'}</span>
                                            {result.vesselClassification.length !== undefined && result.vesselClassification.length > 0 && (
                                                <span>{result.vesselClassification.length}m × {result.vesselClassification.beam}m</span>
                                            )}
                                            {result.vesselClassification.flagMid && (
                                                <span>MID: {result.vesselClassification.flagMid}</span>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {result.classification?.operator && (
                                                <span className="text-white/60 truncate max-w-[80px]">{result.classification.operator}</span>
                                            )}
                                            {result.classification?.icaoType && (
                                                <span>{result.classification.icaoType}</span>
                                            )}
                                        </>
                                    )}
                                    <span>{result.lat.toFixed(4)}° {result.lon.toFixed(4)}°</span>
                                    <span>•</span>
                                    <div className="flex items-center gap-1">
                                        {result.isLive ? <Clock size={8} /> : <History size={8} />}
                                        <span>{formatTimeAgo(result.lastSeen)}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="text-cyan-400/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Search size={12} />
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
