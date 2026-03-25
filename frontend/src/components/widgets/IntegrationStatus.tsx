import { Database, ShieldCheck } from "lucide-react";
import React from "react";

export const IntegrationStatus: React.FC = () => (
  <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-3 py-1.5 opacity-50">
    <div className="flex items-center gap-1.5">
      <Database size={9} className="text-hud-green" />
      <span className="text-[8px] font-mono text-white/60">DB: CONNECTED</span>
    </div>
    <div className="flex items-center gap-1.5">
      <ShieldCheck size={9} className="text-hud-green" />
      <span className="text-[8px] font-mono text-white/60">SECURE_LINK</span>
    </div>
  </div>
);
