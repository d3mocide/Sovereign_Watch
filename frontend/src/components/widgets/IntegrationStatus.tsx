import { Database, Radio, ShieldCheck } from "lucide-react";
import React from "react";

interface IntegrationStatusProps {
  radiorefEnabled?: boolean;
}

export const IntegrationStatus: React.FC<IntegrationStatusProps> = ({
  radiorefEnabled,
}) => (
  <div className="flex items-center justify-between border-t border-white/10 bg-white/5 px-3 py-1.5 opacity-50">
    <div className="flex items-center gap-1.5">
      <Database size={9} className="text-hud-green" />
      <span className="text-[8px] font-mono text-white/60">DB: CONNECTED</span>
    </div>
    <div className="flex items-center gap-3">
      {radiorefEnabled !== undefined && (
        <div className="flex items-center gap-1">
          <Radio
            size={9}
            className={radiorefEnabled ? "text-emerald-400" : "text-white/20"}
          />
          <span
            className={`text-[8px] font-mono ${radiorefEnabled ? "text-white/60" : "text-white/30"}`}
          >
            RADIOREF
          </span>
        </div>
      )}
      <div className="flex items-center gap-1.5">
        <ShieldCheck size={9} className="text-hud-green" />
        <span className="text-[8px] font-mono text-white/60">SECURE_LINK</span>
      </div>
    </div>
  </div>
);
