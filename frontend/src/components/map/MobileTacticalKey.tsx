import { ChevronDown, Plane, Ship } from 'lucide-react';
import { altitudeToColor, speedToColor } from '../../utils/map/colorUtils';

const altitudeMax = 13000;
// Sample the rendering functions so the air scale includes their altitude gamma curve.
const gradient = (color: (value: number) => number[], max: number) => `linear-gradient(to right, ${Array.from({length: 33}, (_, index) => {
  const position = index / 32;
  return `rgb(${color(position * max).slice(0, 3).join(',')}) ${position * 100}%`;
}).join(',')})`;
const airGradient = gradient(altitudeToColor, altitudeMax);
const seaGradient = gradient(speedToColor, 25 / 1.94384);

export function MobileTacticalKey({showAir, showSea}: {showAir: boolean; showSea: boolean}) {
  if (!showAir && !showSea) return null;
  return <details className="mobile-tactical-key">
    <summary>
      <span>Map color key</span>
      <span className="mobile-key-preview" aria-hidden="true">
        {showAir && <><Plane size={13} /><i style={{background: airGradient}} /></>}
        {showSea && <><Ship size={13} /><i style={{background: seaGradient}} /></>}
      </span>
      <ChevronDown size={16} aria-hidden="true" />
    </summary>
    <div className="mobile-key-scales">
      {showAir && <div aria-label="Aircraft altitude color scale">
        <div className="mobile-key-label"><Plane size={14} aria-hidden="true" /><strong>Aircraft altitude</strong><span>feet</span></div>
        <div className="mobile-key-gradient" style={{background: airGradient}} />
        <div className="mobile-key-ticks"><span>0</span><span style={{left: `${10000 / (altitudeMax * 3.28084) * 100}%`}}>10,000</span><span style={{left: `${20000 / (altitudeMax * 3.28084) * 100}%`}}>20,000</span><span>≈43,000</span></div>
      </div>}
      {showSea && <div aria-label="Maritime speed color scale">
        <div className="mobile-key-label"><Ship size={14} aria-hidden="true" /><strong>Maritime speed</strong><span>knots</span></div>
        <div className="mobile-key-gradient" style={{background: seaGradient}} />
        <div className="mobile-key-ticks"><span>0</span><span style={{left: '32%'}}>8</span><span style={{left: '60%'}}>15</span><span>25+</span></div>
      </div>}
    </div>
  </details>;
}
