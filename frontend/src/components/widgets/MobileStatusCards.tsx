import type { SystemHealth } from '../../hooks/useSystemHealth';
import { StreamStatusMonitor } from './StreamStatusMonitor';

export function MobileStatusCards({health,counts,mission}: {
  health:SystemHealth;
  counts:{air:number;sea:number;orbital:number};
  mission?:{lat:number;lon:number;radius_nm:number} | null;
}) {
  return <div className="mobile-status-cards">
    <section aria-label="Mission status"><h3>Mission area</h3>{mission ? <><strong>{mission.radius_nm} NM coverage</strong><p>{mission.lat.toFixed(3)}°, {mission.lon.toFixed(3)}°</p></> : <p>No mission area selected.</p>}</section>
    <section aria-label="Connection status"><h3>Server connection</h3><strong>{health.status === 'offline' ? 'Offline' : health.status === 'degraded' ? 'Degraded' : 'Online'}</strong><p>{health.status === 'offline' ? 'Heartbeat unavailable' : `${health.latency} ms heartbeat latency`}</p></section>
    <section aria-label="Tracking status"><h3>Tracks in view</h3><dl><div><dt>Air</dt><dd>{counts.air.toLocaleString()}</dd></div><div><dt>Sea</dt><dd>{counts.sea.toLocaleString()}</dd></div><div><dt>Orbital</dt><dd>{counts.orbital.toLocaleString()}</dd></div></dl></section>
    <section aria-label="Stream status"><h3>Ingestion streams</h3><StreamStatusMonitor emptyLabel="No stream status available" /></section>
  </div>;
}
