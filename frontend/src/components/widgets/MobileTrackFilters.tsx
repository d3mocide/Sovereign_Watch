import { useId, useState } from 'react';
import { ChevronDown, Plane, Ship, Satellite } from 'lucide-react';

type Filters = {showAir: boolean; showSea: boolean; showSatellites: boolean; [key: string]: boolean | string | number | string[] | undefined};
const groups = [
  {key:'showAir',label:'Aircraft',icon:Plane,items:[['showHelicopter','Helicopters'],['showMilitary','Military'],['showGovernment','Government'],['showCommercial','Commercial'],['showPrivate','Civilian'],['showDrone','Drones']]},
  {key:'showSea',label:'Maritime',icon:Ship,items:[['showCargo','Cargo'],['showTanker','Tankers'],['showPassenger','Passenger'],['showFishing','Fishing'],['showSeaMilitary','Military'],['showLawEnforcement','Law enforcement'],['showSar','Search & rescue'],['showTug','Tugs'],['showPleasure','Recreational'],['showHsc','High speed'],['showPilot','Pilot vessels'],['showSpecial','Special purpose']]},
  {key:'showSatellites',label:'Orbital',icon:Satellite,items:[['showSatGPS','Navigation'],['showSatWeather','Weather'],['showSatComms','Communications'],['showSatSurveillance','Surveillance'],['showSatOther','Other']]},
];
export function MobileTrackFilters({filters,onFilterChange}: {filters:Filters;onFilterChange:(key:string,value:boolean)=>void}) {
  const id=useId();
  const [expanded,setExpanded]=useState<string | null>(null);
  return <div className="mobile-track-filters" aria-label="Track type filters">
    {groups.map(({key,label,icon:Icon,items})=>{
      const enabled=!!filters[key];
      const open=expanded===key;
      return <section key={key}>
        <div className="mobile-filter-group-heading">
          <button aria-expanded={open} aria-controls={`${id}-${key}`} onClick={()=>setExpanded(open?null:key)}>
            <Icon size={17} aria-hidden="true" /><span><strong>{label}</strong><small>{items.filter(([item])=>filters[item]!==false).length} of {items.length} types selected</small></span><ChevronDown size={16} aria-hidden="true" />
          </button>
          <button aria-label={`Toggle all ${label} filters`} aria-pressed={enabled} onClick={()=>onFilterChange(key,!enabled)}>{enabled?'On':'Off'}</button>
        </div>
        {open && <div id={`${id}-${key}`} className="mobile-filter-options">
          {!enabled && <p className="mobile-filter-hint">Enable {label.toLowerCase()} to show these tracks on the map.</p>}
          {items.map(([item,name])=><label key={item} data-selected={filters[item]!==false}>
            <input type="checkbox" checked={filters[item]!==false} onChange={event=>onFilterChange(item,event.target.checked)} />
            <span>{name}</span>
          </label>)}
        </div>}
      </section>;
    })}
  </div>;
}
