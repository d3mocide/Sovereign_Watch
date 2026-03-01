cat << 'INNER_EOF' > /tmp/filters_patch.diff
--- frontend/src/components/widgets/LayerFilters.tsx
+++ frontend/src/components/widgets/LayerFilters.tsx
@@ -437,6 +437,79 @@
             </div>
           )}
         </div>
+
+        {/* Infra Filter */}
+        <div className="flex flex-col gap-1">
+          <div className={`group flex items-center justify-between rounded border transition-all ${filters.showCables !== false ? 'border-cyan-400/30 bg-cyan-400/10' : 'border-white/5 bg-white/5 hover:bg-white/10'}`}>
+            <div
+              className="flex flex-1 items-center justify-between p-2 cursor-pointer"
+              onClick={() => setInfraExpanded(!infraExpanded)}
+            >
+              <div className="flex items-center gap-2">
+                <Network size={14} className={filters.showCables !== false ? 'text-cyan-400' : 'text-white/20'} />
+                <span className={`text-[10px] font-bold tracking-widest ${filters.showCables !== false ? 'text-white' : 'text-white/40'}`}>INFRA</span>
+              </div>
+              <div className="w-4 flex justify-center transition-transform duration-200 shrink-0" style={{ transform: infraExpanded ? 'rotate(90deg)' : 'none' }}>
+                  <ChevronRight size={14} className="text-white/40" />
+              </div>
+            </div>
+
+            <div className="border-l border-white/10 p-2" onClick={(e) => e.stopPropagation()}>
+              <input type="checkbox" className="sr-only" checked={filters.showCables !== false} onChange={(e) => {
+                  const newValue = !filters.showCables && filters.showCables !== undefined;
+                  onFilterChange('showCables', !filters.showCables !== false);
+                  if (filters.showCables === false) {
+                    onFilterChange('showCableStations', true);
+                  }
+              }} />
+              <div
+                className={`h-3 w-6 cursor-pointer rounded-full transition-colors relative ${filters.showCables !== false ? 'bg-cyan-400' : 'bg-white/10 hover:bg-white/20'}`}
+                onClick={(e) => {
+                  e.stopPropagation();
+                  const isCurrentlyOn = filters.showCables !== false;
+                  onFilterChange('showCables', !isCurrentlyOn);
+                  if (!isCurrentlyOn) {
+                    onFilterChange('showCableStations', true);
+                  }
+                }}
+              >
+                <div className={`absolute top-0.5 h-2 w-2 rounded-full bg-black transition-all ${filters.showCables !== false ? 'left-3.5' : 'left-0.5'}`} />
+              </div>
+            </div>
+          </div>
+
+          {/* Sub-filters for Infra */}
+          {infraExpanded && (
+            <div className="flex flex-col gap-1 px-1 opacity-90">
+                {/* Landing Stations */}
+                <label className={`group flex cursor-pointer items-center justify-between rounded border p-1.5 transition-all ${filters.showCableStations !== false ? 'border-cyan-400/20 bg-cyan-400/5' : 'border-white/5 bg-white/5'}`}>
+                    <div className="flex items-center gap-1.5">
+                        <span className="text-[10px]">⚓</span>
+                        <span className={`text-[9px] font-bold tracking-wide ${filters.showCableStations !== false ? 'text-cyan-400/80' : 'text-white/30'}`}>LANDING STATIONS</span>
+                    </div>
+                    <input type="checkbox" className="sr-only" checked={filters.showCableStations !== false} onChange={(e) => onFilterChange('showCableStations', e.target.checked)} />
+                    <div className={`h-2 w-4 shrink-0 cursor-pointer rounded-full transition-colors relative ${filters.showCableStations !== false ? 'bg-cyan-400/80' : 'bg-white/10'}`}><div className={`absolute top-0.5 h-1 w-1 rounded-full bg-black transition-all ${filters.showCableStations !== false ? 'left-2.5' : 'left-0.5'}`} /></div>
+                </label>
+
+                {/* Opacity Slider */}
+                <div className="group flex flex-col gap-1 rounded border border-white/5 bg-white/5 p-2 transition-all">
+                    <div className="flex items-center justify-between">
+                        <span className="text-[9px] font-bold tracking-wide text-white/50">CABLE OPACITY</span>
+                        <span className="text-[9px] text-white/50">{Math.round((filters.cableOpacity ?? 0.6) * 100)}%</span>
+                    </div>
+                    <input
+                        type="range"
+                        min="0.2"
+                        max="1"
+                        step="0.1"
+                        value={filters.cableOpacity ?? 0.6}
+                        onChange={(e) => onFilterChange('cableOpacity', parseFloat(e.target.value))}
+                        className="h-1 w-full appearance-none rounded bg-white/10 outline-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-cyan-400"
+                    />
+                </div>
+            </div>
+          )}
+        </div>
       </div>
     </div>
   );
INNER_EOF
patch -p0 < /tmp/filters_patch.diff
