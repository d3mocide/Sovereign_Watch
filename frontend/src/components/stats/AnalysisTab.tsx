import { BarChart3, Download } from 'lucide-react';

const HEATMAP_CELLS = Array.from({ length: 64 }, (_, i) => ({ id: i, hot: i % 5 === 0 || i % 13 === 0 }));

interface Props {
  onExportCSV: () => void;
}

export default function AnalysisTab({ onExportCSV }: Props) {
  const heatmapCells = HEATMAP_CELLS;

  return (
    <div className="flex-1 flex flex-col p-6 min-w-0 overflow-y-auto custom-scrollbar font-headline">
      <div className="pb-4 border-b border-primary/10 mb-6">
        <h1 className="text-4xl font-black tracking-tighter text-primary uppercase">ANALYTIC DEEP DIVE</h1>
        <p className="text-on-surface-variant text-[10px] mt-1 tracking-widest uppercase">STATISTICAL ANOMALY DETECTION & THROUGHPUT HISTOGRAMS</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-surface-container p-8 border border-primary/20 flex flex-col items-center justify-center text-center">
          <BarChart3 size={48} className="text-primary/30 mb-4" />
          <h2 className="text-2xl font-black text-primary uppercase tracking-tighter">DATASET HISTOGRAM</h2>
          <p className="text-on-surface-variant text-xs mt-2 uppercase tracking-widest max-w-sm">
            Packet size distribution modules are calculating the tactical weight... [PENDING]
          </p>
          <div className="mt-8 flex gap-4">
            <button
              onClick={onExportCSV}
              className="bg-primary/10 border border-primary/40 text-primary px-6 py-3 font-bold text-[10px] tracking-widest uppercase hover:bg-primary/20 transition-all flex items-center gap-2"
            >
              <Download size={14} /> EXPORT CSV
            </button>
          </div>
        </div>

        <div className="bg-surface-container p-6 border border-primary/10">
          <h3 className="font-bold text-xs tracking-widest text-primary uppercase mb-4">Anomaly Heatmap</h3>
          <div className="grid grid-cols-8 gap-1 opacity-40">
            {heatmapCells.map((cell) => (
              <div
                key={cell.id}
                className={`aspect-square border border-primary/5 ${cell.hot ? 'bg-primary/40' : 'bg-primary/5'}`}
              ></div>
            ))}
          </div>
          <div className="mt-4 text-[9px] text-on-surface-variant uppercase tracking-widest">
            DETECTION ENGINE: <span className="text-primary">RUNNING</span>
          </div>
        </div>
      </div>
    </div>
  );
}
