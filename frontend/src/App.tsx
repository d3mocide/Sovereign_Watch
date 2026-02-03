import { useState, useCallback, useRef } from 'react'
import TacticalMap from './components/map/TacticalMap'
import { SidebarLeft } from './components/layouts/SidebarLeft'
import { SidebarRight } from './components/layouts/SidebarRight'
import { MainHud } from './components/layouts/MainHud'
import { TopBar } from './components/layouts/TopBar'
import { CoTEntity } from './types'

// Event type for intelligence feed
interface IntelEvent {
    id: string;
    time: Date;
    type: 'new' | 'lost' | 'alert';
    message: string;
    entityType?: 'air' | 'sea';
}

function App() {
  const [trackCounts, setTrackCounts] = useState({ air: 0, sea: 0 });
  const [selectedEntity, setSelectedEntity] = useState<CoTEntity | null>(null);
  
  // Filter state
  const [filters, setFilters] = useState({
    showAir: true,
    showSea: true,
  });
  
  // Intelligence feed events
  const [events, setEvents] = useState<IntelEvent[]>([]);
  
  // Map Ref for potential imperative actions (future: centering)
  const mapRef = useRef<any>(null);

  // Add new event to feed (max 50 events)
  const addEvent = useCallback((event: Omit<IntelEvent, 'id' | 'time'>) => {
    setEvents(prev => [{
      ...event,
      id: crypto.randomUUID(),
      time: new Date(),
    }, ...prev].slice(0, 50));
  }, []);

  const handleFilterChange = (key: 'showAir' | 'showSea', value: boolean) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const alertsCount = events.filter(e => e.type === 'alert').length;

  return (
    <MainHud
      topBar={<TopBar alertsCount={alertsCount} />}
      leftSidebar={
        <SidebarLeft 
          trackCounts={trackCounts}
          filters={filters}
          onFilterChange={handleFilterChange}
          events={events}
        />
      }
      rightSidebar={
        <SidebarRight 
          entity={selectedEntity} 
          onClose={() => setSelectedEntity(null)} 
          onCenterMap={(lat, lon) => {
            console.log("Centering on:", lat, lon);
            // Imperative map centering could be handled here via a prop to TacticalMap
          }}
        />
      }
    >
      <TacticalMap 
          onCountsUpdate={setTrackCounts} 
          filters={filters}
          onEvent={addEvent}
          selectedEntity={selectedEntity}
          onEntitySelect={setSelectedEntity}
      />
    </MainHud>
  )
}

export default App
