import { useState, useCallback } from 'react'
import TacticalMap from './components/map/TacticalMap'
import { SidebarLeft } from './components/layouts/SidebarLeft'
import { SidebarRight } from './components/layouts/SidebarRight'
import { MainHud } from './components/layouts/MainHud'
import { TopBar } from './components/layouts/TopBar'
import { CoTEntity } from './types'
import { useSystemHealth } from './hooks/useSystemHealth'

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
  const health = useSystemHealth();
  
  // Filter state
  const [filters, setFilters] = useState({
    showAir: true,
    showSea: true,
  });
  
  // Velocity Vector Toggle
  const [showVelocityVectors, setShowVelocityVectors] = useState(() => {
    const saved = localStorage.getItem('showVelocityVectors');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const handleVelocityVectorToggle = useCallback(() => {
    setShowVelocityVectors((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem('showVelocityVectors', JSON.stringify(newValue));
      return newValue;
    });
  }, []);

  // History Tails Toggle
  const [showHistoryTails, setShowHistoryTails] = useState(() => {
    const saved = localStorage.getItem('showHistoryTails');
    return saved !== null ? JSON.parse(saved) : true; // Default to true for better initial UX
  });

  const handleHistoryTailsToggle = useCallback(() => {
    setShowHistoryTails((prev: boolean) => {
      const newValue = !prev;
      localStorage.setItem('showHistoryTails', JSON.stringify(newValue));
      return newValue;
    });
  }, []);
  
  // Intelligence feed events
  const [events, setEvents] = useState<IntelEvent[]>([]);
  
  // Mission management state
  const [missionProps, setMissionProps] = useState<unknown>(null);
  
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
      topBar={
        <TopBar 
          alertsCount={alertsCount} 
          location={missionProps?.currentMission} 
          health={health} 
          showVelocityVectors={showVelocityVectors} 
          onToggleVelocityVectors={handleVelocityVectorToggle}
          showHistoryTails={showHistoryTails}
          onToggleHistoryTails={handleHistoryTailsToggle}
        />
      }
      leftSidebar={
        <SidebarLeft 
          trackCounts={trackCounts}
          filters={filters}
          onFilterChange={handleFilterChange}
          events={events}
          missionProps={missionProps}
          health={health}
        />
      }
      rightSidebar={
        <SidebarRight 
          entity={selectedEntity} 
          onClose={() => setSelectedEntity(null)} 
          onCenterMap={(lat, lon) => {
            // console.log("Centering on:", lat, lon);
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
          onMissionPropsReady={setMissionProps}
          showVelocityVectors={showVelocityVectors}
          showHistoryTails={showHistoryTails}
      />
    </MainHud>
  )
}

export default App
