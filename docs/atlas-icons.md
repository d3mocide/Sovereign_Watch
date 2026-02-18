import React, { useEffect, useRef, useState } from 'react';

// ------------------------------------------------------------------
// LOGIC: Icon Definitions & Atlas Generation
// ------------------------------------------------------------------

export type AtlasTheme = 'stroke' | 'fill' | 'duotone' | 'neon' | 'neon-duotone';

export interface CoTEntity {
    id: string;
    type: string;
    lat: number;
    lon: number;
    altitude?: number; // Added altitude for simulation
    classification?: {
      platform?: string;
      affiliation?: string;
      sizeClass?: string;
      category?: string;
    };
    course?: number;
    speed?: number;
}

/**
 * Creates a procedural 512x128 sprite atlas for tactical icons.
 * Returns the mapping object required by Deck.GL IconLayer.
 */
export function createIconAtlas(canvasEl: HTMLCanvasElement | null, theme: AtlasTheme = 'stroke') {
    const CELL = 64;
    const COLS = 8;
    const ROWS = 2;
    
    const canvas = canvasEl || document.createElement('canvas');
    canvas.width = CELL * COLS;
    canvas.height = CELL * ROWS;
    const ctx = canvas.getContext('2d');
  
    if (!ctx) return {}; 
  
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // --- Style Configuration ---
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    
    // Default White
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';

    // Theme Specifics
    if (theme === 'neon' || theme === 'neon-duotone') {
        ctx.lineWidth = 2;
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 8;
    } else {
        ctx.lineWidth = 3;
    }

    if (theme === 'duotone' || theme === 'neon-duotone') {
        // Semi-transparent fill for duotone
        ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
    }

    // --- Drawing Helper ---
    // Handles the repetitive styling logic for every icon
    const drawInCell = (col: number, row: number, drawFn: (cx: number, cy: number) => void) => {
      ctx.save();
      const cx = col * CELL + CELL / 2;
      const cy = row * CELL + CELL / 2;

      // 1. Define Path
      ctx.beginPath();
      drawFn(cx, cy);

      // 2. Apply Theme Styles to the current path
      if (theme === 'fill') {
          ctx.fill();
      } else if (theme === 'stroke' || theme === 'neon') {
          ctx.stroke();
      } else if (theme === 'duotone' || theme === 'neon-duotone') {
          ctx.fill();   // 30% white fill
          ctx.stroke(); // 100% white stroke
      }
      
      ctx.restore();
    };

    // --- GEOMETRIC PATH DEFINITIONS ---

    // 1. JET LARGE (Heavy Air)
    // Wide-base triangle with notch
    drawInCell(0, 0, (cx, cy) => {
        ctx.moveTo(cx, cy - 24);
        ctx.lineTo(cx + 24, cy + 20);
        ctx.lineTo(cx, cy + 12); // Notch
        ctx.lineTo(cx - 24, cy + 20);
        ctx.closePath();
    });
  
    // 2. JET SMALL (BizJet)
    // Narrower triangle with notch
    drawInCell(1, 0, (cx, cy) => {
        ctx.moveTo(cx, cy - 20);
        ctx.lineTo(cx + 14, cy + 20);
        ctx.lineTo(cx, cy + 16); // Notch
        ctx.lineTo(cx - 14, cy + 20);
        ctx.closePath();
    });
  
    // 3. TURBOPROP (Dash-8 / King Air)
    // Narrow chevron with straight Wing Bar
    drawInCell(2, 0, (cx, cy) => {
        // Body
        ctx.moveTo(cx, cy - 20);
        ctx.lineTo(cx + 14, cy + 20);
        ctx.lineTo(cx, cy + 16);
        ctx.lineTo(cx - 14, cy + 20);
        ctx.closePath();
        
        // We handle the stroke/fill for the main body above.
        // For the Wing Bar, we need to ensure it draws correctly in all modes.
        // In fill mode, a single line is invisible, so we make it a thin rectangle or just stroke it.
        
        if (theme === 'fill') {
             ctx.rect(cx - 20, cy - 2, 40, 4); // Draw bar as shape
        } else {
             // For stroke/duotone/neon, just draw the line
             ctx.moveTo(cx - 20, cy);
             ctx.lineTo(cx + 20, cy);
        }
    });
  
    // 4. PROP SINGLE (Cessna / GA)
    // Small Dart
    drawInCell(3, 0, (cx, cy) => {
        ctx.moveTo(cx, cy - 18);
        ctx.lineTo(cx + 10, cy + 10);
        ctx.lineTo(cx, cy + 18); // Tail extends past wing
        ctx.lineTo(cx - 10, cy + 10);
        ctx.closePath();
    });
  
    // 5. HELICOPTER
    // Chevron with "Rotor Hat"
    drawInCell(4, 0, (cx, cy) => {
        // Rotor Hat
        if (theme === 'fill') {
            ctx.rect(cx - 16, cy - 12, 32, 4); // Thick bar for fill mode
            ctx.rect(cx - 2, cy - 10, 4, 10);  // Connector
        } else {
            ctx.moveTo(cx - 16, cy - 10);
            ctx.lineTo(cx + 16, cy - 10);
            ctx.moveTo(cx, cy - 10);
            ctx.lineTo(cx, cy);
        }

        // Body
        ctx.moveTo(cx, cy - 4);
        ctx.lineTo(cx + 12, cy + 16);
        ctx.lineTo(cx, cy + 10);
        ctx.lineTo(cx - 12, cy + 16);
        ctx.closePath();
    });
  
    // 6. MILITARY FAST (Fighter)
    // Arrowhead with Center Spine
    drawInCell(5, 0, (cx, cy) => {
        ctx.moveTo(cx, cy - 28);
        ctx.lineTo(cx + 16, cy + 20);
        ctx.lineTo(cx, cy + 12); 
        ctx.lineTo(cx - 16, cy + 20);
        ctx.closePath();
        
        // Spine
        if (theme !== 'fill') {
            ctx.moveTo(cx, cy - 28);
            ctx.lineTo(cx, cy + 12);
        }
    });
  
    // 7. MILITARY TRANSPORT (C-130 / C-17)
    // Heavy Wedge (Hexagon) with Center Spine
    drawInCell(6, 0, (cx, cy) => {
        ctx.moveTo(cx, cy - 26);     
        ctx.lineTo(cx + 22, cy + 6); // Wing tip
        ctx.lineTo(cx + 8, cy + 24); // Tail
        ctx.lineTo(cx - 8, cy + 24); 
        ctx.lineTo(cx - 22, cy + 6); 
        ctx.closePath();
        
        // Spine
        if (theme !== 'fill') {
            ctx.moveTo(cx, cy - 26);
            ctx.lineTo(cx, cy + 24);
        }
    });
  
    // 8. DRONE (UAV)
    // Stealth Flying Wing (Flat chevron)
    drawInCell(7, 0, (cx, cy) => {
        ctx.moveTo(cx, cy - 16);     // Nose
        ctx.lineTo(cx + 28, cy + 8); // Right Wingtip
        ctx.lineTo(cx, cy + 2);      // Notch
        ctx.lineTo(cx - 28, cy + 8); // Left Wingtip
        ctx.closePath();
    });
  
    // 9. VESSEL (Surface)
    // Naval Bullet / Plan View
    drawInCell(0, 1, (cx, cy) => {
        ctx.moveTo(cx, cy - 28);       // Bow
        ctx.lineTo(cx + 10, cy - 8);   
        ctx.lineTo(cx + 10, cy + 24);  // Stern
        ctx.lineTo(cx - 10, cy + 24);  
        ctx.lineTo(cx - 10, cy - 8);   
        ctx.closePath();
    });
  
    // 10. UNKNOWN (Default)
    // Standard Chevron
    drawInCell(1, 1, (cx, cy) => {
        ctx.moveTo(cx, cy - 20);
        ctx.lineTo(cx + 16, cy + 20);
        ctx.lineTo(cx, cy + 10);
        ctx.lineTo(cx - 16, cy + 20);
        ctx.closePath();
    });
  
    // Build Mapping
    const mapping: Record<string, any> = {};
    const icons = [
        'jet_large', 'jet_small', 'turboprop', 'prop_single', 
        'helicopter', 'military_fast', 'military_transport', 'drone'
    ];
    icons.forEach((name, i) => {
        mapping[name] = { x: i * CELL, y: 0, width: CELL, height: CELL, mask: true, anchorY: 32 };
    });
    mapping['vessel'] = { x: 0, y: CELL, width: CELL, height: CELL, mask: true, anchorY: 32 };
    mapping['unknown'] = { x: CELL, y: CELL, width: CELL, height: CELL, mask: true, anchorY: 32 };
  
    return mapping;
}

// ------------------------------------------------------------------
// LOGIC: Icon Selection & Coloring
// ------------------------------------------------------------------

export function getIconName(entity: CoTEntity): string {
    const cls = entity.classification;
    const isShip = entity.type?.includes('S');
    if (isShip) return 'vessel';
    if (!cls) return 'unknown';

    if (cls.platform === 'helicopter') return 'helicopter';
    if (cls.platform === 'drone') return 'drone';
    if (cls.platform === 'turboprop') return 'turboprop';

    if (cls.affiliation === 'military') {
        if (cls.platform === 'high_performance' || cls.category === 'A6')
            return 'military_fast';
        if (cls.sizeClass === 'heavy' || cls.sizeClass === 'large')
            return 'military_transport';
        return 'military_fast'; 
    }

    if (cls.sizeClass === 'heavy' || cls.sizeClass === 'large') return 'jet_large';
    if (cls.sizeClass === 'small') return 'jet_small';
    if (cls.sizeClass === 'light') return 'prop_single';

    if (cls.category) {
        const cat = cls.category;
        if (['A3','A4','A5'].includes(cat)) return 'jet_large';
        if (cat === 'A2') return 'jet_small';
        if (cat === 'A1') return 'prop_single';
    }

    return 'unknown';
}

/**
 * Returns a color based on altitude (0 - 40000ft)
 * Green (Low) -> Yellow -> Red (High)
 */
export function getAltitudeColor(altitude: number = 0): string {
    // Clamp altitude between 0 and 40000
    const alt = Math.max(0, Math.min(altitude, 40000));
    
    // Calculate Hue: 120 (Green) down to 0 (Red)
    // 0ft = 120
    // 20000ft = 60 (Yellow)
    // 40000ft = 0 (Red)
    const hue = 120 - (alt / 40000) * 120;
    
    return `hsl(${hue}, 100%, 50%)`;
}

// ------------------------------------------------------------------
// MAIN APP COMPONENT
// ------------------------------------------------------------------

const IconViewer = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [theme, setTheme] = useState<AtlasTheme>('stroke');
  const [viewMode, setViewMode] = useState<'standard' | 'altitude'>('standard');
  const [altitude, setAltitude] = useState(20000); 
  const [useUnifiedAltitude, setUseUnifiedAltitude] = useState(true);
  const [atlasUrl, setAtlasUrl] = useState('');
  const [iconSize, setIconSize] = useState<16 | 32 | 64>(64); // New State: Icon Size
  
  // Force redraw when theme changes
  useEffect(() => {
    if (canvasRef.current) {
      createIconAtlas(canvasRef.current, theme);
      setAtlasUrl(canvasRef.current.toDataURL());
    }
  }, [theme]);

  const testCases: { name: string; entity: Partial<CoTEntity> }[] = [
    { name: "Unknown / Default", entity: { classification: undefined, altitude: 0 } },
    { name: "Military Fighter", entity: { classification: { platform: 'high_performance', affiliation: 'military' }, altitude: 1500 } },
    { name: "Military Transport", entity: { classification: { sizeClass: 'large', affiliation: 'military' }, altitude: 18000 } },
    { name: "Helicopter", entity: { classification: { platform: 'helicopter', affiliation: 'military' }, altitude: 200 } },
    { name: "Drone", entity: { classification: { platform: 'drone' }, altitude: 45000 } }, 
    { name: "Airliner", entity: { classification: { sizeClass: 'heavy', affiliation: 'civilian' }, altitude: 36000 } },
    { name: "Business Jet", entity: { classification: { sizeClass: 'small', affiliation: 'civilian' }, altitude: 12000 } },
    { name: "Turboprop", entity: { classification: { platform: 'turboprop', affiliation: 'civilian' }, altitude: 22000 } },
    { name: "Light Prop", entity: { classification: { sizeClass: 'light', affiliation: 'civilian' }, altitude: 4500 } },
    { name: "Naval Vessel", entity: { type: 'S-1-2', classification: { platform: 'surface' }, altitude: 0 } },
  ];

  return (
    <div className="p-6 bg-slate-900 min-h-screen text-slate-100 font-sans">
      <div className="max-w-4xl mx-auto space-y-8">
        
        {/* Header & Controls */}
        <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-slate-700 pb-4 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-blue-400">Tactical Map Icon Atlas</h1>
            <p className="text-slate-400 text-sm mt-1">
               Refined Geometric Design Language
            </p>
          </div>
          
          <div className="flex flex-wrap gap-1 bg-slate-800 p-1 rounded-lg border border-slate-700">
             {(['stroke', 'fill', 'duotone', 'neon', 'neon-duotone'] as AtlasTheme[]).map((t) => (
                 <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={`px-3 py-2 text-xs font-medium rounded-md transition-all ${
                        theme === t 
                        ? 'bg-blue-600 text-white shadow' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-700'
                    }`}
                 >
                    {t.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}
                 </button>
             ))}
          </div>
        </div>

        {/* The Atlas Visualization */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700 shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Atlas Texture (512x128)</h2>
            <span className="text-xs px-2 py-1 bg-slate-700 rounded text-slate-300">
                Style: <span className="text-blue-300 font-bold">{theme}</span>
            </span>
          </div>
          
          <div className="overflow-x-auto bg-slate-950 p-4 rounded-lg border border-slate-800 flex justify-center relative">
            <div className="absolute inset-0 opacity-10 pointer-events-none" 
                 style={{ backgroundImage: 'radial-gradient(circle, #333 1px, transparent 1px)', backgroundSize: '16px 16px' }}></div>
            
            <canvas 
              ref={canvasRef} 
              width={512} 
              height={128} 
              className="border border-dashed border-slate-600 relative z-10"
            />
          </div>
        </div>

        {/* Live Preview Grid */}
        <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 gap-4">
                <h2 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Type & Altitude Mapping</h2>
                
                <div className="flex gap-4 items-center">
                    {/* Size Toggles */}
                    <div className="flex bg-slate-900 rounded p-1 border border-slate-700">
                        {([16, 32, 64] as const).map(size => (
                             <button 
                                key={size}
                                onClick={() => setIconSize(size)}
                                className={`px-2 py-1 text-xs rounded ${iconSize === size ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                             >{size}px</button>
                        ))}
                    </div>

                    <div className="h-4 w-px bg-slate-700"></div>

                    {/* Mode Toggles */}
                    <div className="flex bg-slate-900 rounded p-1 border border-slate-700">
                         <button 
                            onClick={() => setViewMode('standard')}
                            className={`px-3 py-1 text-xs rounded ${viewMode === 'standard' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                         >Standard</button>
                         <button 
                            onClick={() => setViewMode('altitude')}
                            className={`px-3 py-1 text-xs rounded ${viewMode === 'altitude' ? 'bg-slate-700 text-white' : 'text-slate-400'}`}
                         >Altitude</button>
                    </div>
                </div>
            </div>

            {/* Altitude Slider Control */}
            {viewMode === 'altitude' && (
                <div className="mb-6 p-4 bg-slate-900 rounded border border-slate-700">
                    <div className="flex justify-between mb-2">
                        <label className="text-sm text-slate-300 flex items-center gap-2 cursor-pointer">
                            <input 
                                type="checkbox" 
                                checked={useUnifiedAltitude} 
                                onChange={e => setUseUnifiedAltitude(e.target.checked)} 
                                className="accent-blue-500"
                            />
                            Sync All Altitudes
                        </label>
                        <span className="text-sm font-mono text-blue-300">{altitude.toLocaleString()} FT</span>
                    </div>
                    
                    <div className="relative pt-1">
                        <input 
                            type="range" 
                            min="0" max="45000" step="100" 
                            value={altitude} 
                            onChange={(e) => setAltitude(Number(e.target.value))}
                            className={`w-full h-2 rounded-lg appearance-none cursor-pointer ${useUnifiedAltitude ? 'bg-slate-700' : 'bg-slate-800 opacity-50'}`}
                            disabled={!useUnifiedAltitude}
                        />
                         {/* Color Scale Gradient Indicator */}
                        <div className={`h-2 w-full mt-2 rounded-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-600 ${useUnifiedAltitude ? 'opacity-100' : 'opacity-40'}`}></div>
                        <div className="flex justify-between text-xs text-slate-500 mt-1 font-mono">
                            <span>0 FT (GND)</span>
                            <span>20k FT</span>
                            <span>40k+ FT</span>
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {testCases.map((test, idx) => {
                    const iconName = getIconName(test.entity as CoTEntity);
                    const [col, row] = getIconGridPos(iconName);
                    
                    // Determine altitude: either global slider or entity specific
                    const currentAlt = (viewMode === 'altitude' && useUnifiedAltitude) 
                        ? altitude 
                        : (test.entity.altitude || 0);
                        
                    const altColor = getAltitudeColor(currentAlt);
                    
                    // --- SCALING LOGIC ---
                    const baseCell = 64; 
                    const scale = iconSize / baseCell; 
                    
                    // Calculate dynamic styles based on size
                    const bgWidth = 512 * scale;
                    const bgHeight = 128 * scale;
                    const bgPosX = -(col * baseCell * scale);
                    const bgPosY = -(row * baseCell * scale);

                    const bgStyle = {
                        width: `${iconSize}px`,
                        height: `${iconSize}px`,
                        backgroundSize: `${bgWidth}px ${bgHeight}px`,
                        backgroundPosition: `${bgPosX}px ${bgPosY}px`,
                        backgroundRepeat: 'no-repeat'
                    };

                    const maskStyle = {
                         width: `${iconSize}px`,
                         height: `${iconSize}px`,
                         backgroundColor: altColor,
                         WebkitMaskImage: `url(${atlasUrl})`,
                         maskImage: `url(${atlasUrl})`,
                         WebkitMaskSize: `${bgWidth}px ${bgHeight}px`,
                         maskSize: `${bgWidth}px ${bgHeight}px`,
                         WebkitMaskPosition: `${bgPosX}px ${bgPosY}px`,
                         maskPosition: `${bgPosX}px ${bgPosY}px`,
                         WebkitMaskRepeat: 'no-repeat',
                         maskRepeat: 'no-repeat'
                    };

                    return (
                        <div key={idx} className="flex items-center justify-between p-3 bg-slate-900 rounded border border-slate-700 hover:border-blue-500 transition-colors group">
                            <div>
                                <div className="text-sm font-medium text-slate-200 group-hover:text-blue-300">{test.name}</div>
                                {viewMode === 'altitude' && (
                                    <div className="text-xs font-mono mt-1 transition-colors" style={{ color: altColor }}>
                                        ALT: {currentAlt.toLocaleString()} FT
                                    </div>
                                )}
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-xs text-slate-500 font-mono hidden sm:block">
                                    {iconName}
                                </span>
                                
                                <div className={`w-20 h-20 bg-slate-950 rounded flex items-center justify-center border border-slate-800`}>
                                   {viewMode === 'standard' ? (
                                       <div style={{ ...bgStyle, backgroundImage: `url(${atlasUrl})` }} />
                                   ) : (
                                       <div style={maskStyle} />
                                   )}
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
        </div>

      </div>
    </div>
  );
};

// Helper to get raw grid coordinates
const getIconGridPos = (name: string): [number, number] => {
    const map: Record<string, [number, number]> = {
        'jet_large': [0, 0],
        'jet_small': [1, 0],
        'turboprop': [2, 0],
        'prop_single': [3, 0],
        'helicopter': [4, 0],
        'military_fast': [5, 0],
        'military_transport': [6, 0],
        'drone': [7, 0],
        'vessel': [0, 1],
        'unknown': [1, 1],
    };
    return map[name] || [1, 1]; // Default to unknown if missing
}

export default IconViewer;
