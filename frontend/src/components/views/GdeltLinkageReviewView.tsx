import { FormEvent, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeftRight, GitCompareArrows, Radar, Search } from 'lucide-react';

import {
  fetchGdeltLinkageReview,
  type GdeltLinkageReviewEvent,
  type GdeltLinkageReviewResponse,
} from '../../api/gdeltLinkageReview';

type MissionMode = 'h3' | 'radius';

function formatCountLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatEventId(event: GdeltLinkageReviewEvent): string {
  return String(event.event_id_cnty ?? event.event_id ?? 'unknown');
}

function formatReasonList(values: string[] | undefined): string {
  if (!values || values.length === 0) return '—';
  return values.map(formatCountLabel).join(', ');
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: 'emerald' | 'amber' | 'cyan';
}) {
  const toneClass =
    tone === 'emerald'
      ? 'border-emerald-400/30 text-emerald-300 bg-emerald-400/5'
      : tone === 'amber'
        ? 'border-amber-400/30 text-amber-300 bg-amber-400/5'
        : 'border-cyan-400/30 text-cyan-300 bg-cyan-400/5';

  return (
    <div className={`rounded-sm border p-3 ${toneClass}`}>
      <div className="text-[10px] uppercase tracking-[0.25em] text-white/35">{label}</div>
      <div className="mt-2 text-2xl font-black tracking-tight">{value}</div>
    </div>
  );
}

function EventTable({
  title,
  subtitle,
  events,
  showExperimental,
}: {
  title: string;
  subtitle: string;
  events: GdeltLinkageReviewEvent[];
  showExperimental?: boolean;
}) {
  return (
    <div className="rounded-sm border border-white/10 bg-black/40 overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3 bg-white/[0.03]">
        <div className="text-sm font-black tracking-wide text-white/90 uppercase">{title}</div>
        <div className="text-[10px] font-mono text-white/45 mt-1">{subtitle}</div>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left font-mono text-[11px]">
          <thead className="bg-white/[0.02] text-white/40 uppercase tracking-wider text-[9px]">
            <tr>
              <th className="px-4 py-2">Event</th>
              <th className="px-4 py-2">Actors</th>
              <th className="px-4 py-2">Score</th>
              <th className="px-4 py-2">Tier</th>
              {showExperimental && <th className="px-4 py-2">Experimental Reason</th>}
            </tr>
          </thead>
          <tbody>
            {events.length === 0 ? (
              <tr>
                <td colSpan={showExperimental ? 5 : 4} className="px-4 py-4 text-white/35">
                  No events in this sample.
                </td>
              </tr>
            ) : (
              events.map((event) => (
                <tr key={formatEventId(event)} className="border-t border-white/5 align-top">
                  <td className="px-4 py-3 text-white/80">
                    <div className="font-bold text-white/90">{formatEventId(event)}</div>
                    <div className="text-white/45 mt-1 max-w-[340px] whitespace-normal leading-relaxed">
                      {event.event_text ?? 'No headline available'}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {event.actor1_country ?? '—'} / {event.actor2_country ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-white/80">
                    {event.linkage_score ?? event.live_linkage_score ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-white/70">
                    {event.linkage_tier ?? event.live_linkage_tier ?? '—'}
                  </td>
                  {showExperimental && (
                    <td className="px-4 py-3 text-white/70">
                      {formatReasonList(event.experimental_reasons)}
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function GdeltLinkageReviewView() {
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const initialMode: MissionMode = initialParams.get('h3_region') ? 'h3' : 'radius';

  const [missionMode, setMissionMode] = useState<MissionMode>(initialMode);
  const [h3Region, setH3Region] = useState(initialParams.get('h3_region') ?? '');
  const [lat, setLat] = useState(initialParams.get('lat') ?? '25.2048');
  const [lon, setLon] = useState(initialParams.get('lon') ?? '55.2708');
  const [radiusNm, setRadiusNm] = useState(initialParams.get('radius_nm') ?? '180');
  const [hours, setHours] = useState(initialParams.get('hours') ?? '24');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<GdeltLinkageReviewResponse | null>(null);

  const executeSearch = async () => {
    setLoading(true);
    setError(null);
    try {
      const hoursValue = Number(hours);
      const request =
        missionMode === 'h3'
          ? { hours: hoursValue, h3Region }
          : {
              hours: hoursValue,
              lat: Number(lat),
              lon: Number(lon),
              radiusNm: Number(radiusNm),
            };

      const response = await fetchGdeltLinkageReview(request);
      setData(response);

      const params = new URLSearchParams({ hours: String(hoursValue) });
      if (missionMode === 'h3') {
        params.set('h3_region', h3Region);
      } else {
        params.set('lat', lat);
        params.set('lon', lon);
        params.set('radius_nm', radiusNm);
      }
      window.history.replaceState(null, '', `/test?${params.toString()}`);
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : String(caughtError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if ((missionMode === 'h3' && h3Region) || (missionMode === 'radius' && lat && lon && radiusNm)) {
      void executeSearch();
    }
  }, []);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await executeSearch();
  };

  return (
    <div className="min-h-screen bg-[#0b0e12] text-white font-sans">
      <header className="border-b border-cyan-400/10 bg-black/50 backdrop-blur px-6 py-4 flex items-center justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.35em] text-cyan-300/70 font-black">Test Surface</div>
          <h1 className="text-2xl font-black tracking-tight mt-1">GDELT Linkage Review</h1>
        </div>
        <nav className="flex gap-4 text-[11px] uppercase tracking-[0.25em] font-black">
          <a href="/" className="text-white/50 hover:text-white">Tactical Map</a>
          <a href="/stats" className="text-white/50 hover:text-white">Stats</a>
          <a href="/test" className="text-cyan-300">Test</a>
        </nav>
      </header>

      <main className="px-6 py-6 space-y-6 max-w-[1600px] mx-auto">
        <section className="rounded-sm border border-white/10 bg-black/40 p-4">
          <div className="flex items-center gap-2 text-cyan-300 mb-3">
            <GitCompareArrows size={16} />
            <span className="text-sm font-black uppercase tracking-[0.2em]">How To Compare</span>
          </div>
          <p className="text-sm text-white/75 max-w-[1100px] leading-relaxed">
            This page compares the same mission query across two models: the live deterministic linkage set and the review-only experimental candidate set.
            Focus on <span className="text-cyan-300 font-bold">experimental only count</span> to see what would widen if second-order or support-country rules were promoted, and inspect the experimental reasons column to see exactly why each candidate is outside the live trust boundary.
          </p>
        </section>

        <form onSubmit={onSubmit} className="rounded-sm border border-white/10 bg-black/40 p-4 space-y-4">
          <div className="flex items-center gap-2 text-cyan-300">
            <Radar size={16} />
            <span className="text-sm font-black uppercase tracking-[0.2em]">Mission Query</span>
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setMissionMode('h3')}
              className={`px-3 py-2 text-xs font-black uppercase tracking-[0.2em] border rounded-sm ${missionMode === 'h3' ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-white/10 text-white/50'}`}
            >
              H3 Mission
            </button>
            <button
              type="button"
              onClick={() => setMissionMode('radius')}
              className={`px-3 py-2 text-xs font-black uppercase tracking-[0.2em] border rounded-sm ${missionMode === 'radius' ? 'border-cyan-400/40 bg-cyan-400/10 text-cyan-300' : 'border-white/10 text-white/50'}`}
            >
              Radius Mission
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {missionMode === 'h3' ? (
              <label className="md:col-span-3 text-[11px] uppercase tracking-[0.2em] text-white/45">
                H3 Region
                <input value={h3Region} onChange={(event) => setH3Region(event.target.value)} className="mt-2 w-full bg-[#07090d] border border-white/10 px-3 py-2 text-white rounded-sm font-mono normal-case tracking-normal" placeholder="8728f2ba8ffffff" />
              </label>
            ) : (
              <>
                <label className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                  Latitude
                  <input value={lat} onChange={(event) => setLat(event.target.value)} className="mt-2 w-full bg-[#07090d] border border-white/10 px-3 py-2 text-white rounded-sm font-mono normal-case tracking-normal" />
                </label>
                <label className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                  Longitude
                  <input value={lon} onChange={(event) => setLon(event.target.value)} className="mt-2 w-full bg-[#07090d] border border-white/10 px-3 py-2 text-white rounded-sm font-mono normal-case tracking-normal" />
                </label>
                <label className="text-[11px] uppercase tracking-[0.2em] text-white/45">
                  Radius Nm
                  <input value={radiusNm} onChange={(event) => setRadiusNm(event.target.value)} className="mt-2 w-full bg-[#07090d] border border-white/10 px-3 py-2 text-white rounded-sm font-mono normal-case tracking-normal" />
                </label>
              </>
            )}
            <label className="text-[11px] uppercase tracking-[0.2em] text-white/45">
              Hours
              <input value={hours} onChange={(event) => setHours(event.target.value)} className="mt-2 w-full bg-[#07090d] border border-white/10 px-3 py-2 text-white rounded-sm font-mono normal-case tracking-normal" />
            </label>
          </div>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={loading} className="inline-flex items-center gap-2 px-4 py-2 rounded-sm border border-cyan-400/30 bg-cyan-400/10 text-cyan-300 text-xs font-black uppercase tracking-[0.25em] disabled:opacity-50">
              <Search size={14} />
              {loading ? 'Running Review' : 'Run Review'}
            </button>
            {data?.mission_country_code && (
              <span className="text-[11px] font-mono text-white/45">Mission country: {data.mission_country_code}</span>
            )}
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-sm border border-red-400/20 bg-red-400/5 px-3 py-2 text-sm text-red-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
        </form>

        {data && (
          <>
            <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard label="Overlap" value={data.comparison.overlap_count} tone="emerald" />
              <SummaryCard label="Live Only" value={data.comparison.live_only_count} tone="cyan" />
              <SummaryCard label="Experimental Only" value={data.comparison.experimental_only_count} tone="amber" />
            </section>

            <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              <div className="rounded-sm border border-white/10 bg-black/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.25em] text-white/40 font-black">Live Counts</div>
                <div className="mt-3 space-y-2 text-sm font-mono">
                  {Object.entries(data.live.counts).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <span className="text-white/55">{formatCountLabel(key)}</span>
                      <span className="text-white/85">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-sm border border-white/10 bg-black/40 p-4">
                <div className="text-[11px] uppercase tracking-[0.25em] text-white/40 font-black">Experimental Counts</div>
                <div className="mt-3 space-y-2 text-sm font-mono">
                  {Object.entries(data.experimental.counts).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-4">
                      <span className="text-white/55">{formatCountLabel(key)}</span>
                      <span className="text-white/85">{value}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="rounded-sm border border-white/10 bg-black/40 p-4">
                <div className="inline-flex items-center gap-2 text-[11px] uppercase tracking-[0.25em] text-white/40 font-black">
                  <ArrowLeftRight size={14} />
                  Review Sets
                </div>
                <div className="mt-3 space-y-3 text-sm font-mono text-white/75">
                  <div>
                    <div className="text-white/40 mb-1">Second-order only</div>
                    <div>{data.experimental.country_sets.second_order_only.join(', ') || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/40 mb-1">Alliance support</div>
                    <div>{data.experimental.country_sets.alliance_support.join(', ') || '—'}</div>
                  </div>
                  <div>
                    <div className="text-white/40 mb-1">Basing support</div>
                    <div>{data.experimental.country_sets.basing_support.join(', ') || '—'}</div>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <EventTable
                title="Live Admitted Sample"
                subtitle="Current production linkage set for this mission query"
                events={data.live.sample}
              />
              <EventTable
                title="Experimental Candidate Sample"
                subtitle="Review-only candidates that would widen scope if promoted"
                events={data.experimental.sample}
                showExperimental
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}