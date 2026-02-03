import React from 'react';

interface MainHudProps {
  children?: React.ReactNode; // The Map layer
  leftSidebar?: React.ReactNode;
  rightSidebar?: React.ReactNode;
  topBar?: React.ReactNode;
}

/**
 * MainHud - The tactical shell layout.
 * Manages Z-indexing, interactions, and grid positioning.
 */
export const MainHud: React.FC<MainHudProps> = ({ 
  children, 
  leftSidebar, 
  rightSidebar, 
  topBar 
}) => {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-tactical-bg font-mono text-mono-base selection:bg-hud-green selection:text-black">
      {/* Z-0: Tactical Map Layer */}
      <div className="absolute inset-0 z-0">
        {children}
      </div>

      {/* Z-5: CRT/Grid Overlay Effects */}
      <div className="pointer-events-none absolute inset-0 z-[5] bg-grid-pattern opacity-10 mix-blend-screen" />
      <div className="pointer-events-none absolute inset-0 z-[6] bg-[radial-gradient(circle_at_center,transparent_0%,#000000_120%)] opacity-40" />

      {/* Subtle Noise/Grain */}
      <div className="pointer-events-none absolute inset-0 z-[8] bg-noise-pattern opacity-[0.02] mix-blend-overlay" />

      {/* Z-10: UI Layer (Pass-through clicks) */}
      <div className="pointer-events-none absolute inset-0 z-10 flex flex-col">
        
        {/* Top Bar Zone */}
        <div className="pointer-events-auto shrink-0 border-b border-hud-green/20 bg-black/40 backdrop-blur-md">
            {topBar}
        </div>

        {/* Main Content Columns */}
        <div className="flex min-h-0 flex-1 justify-between p-4">
            
            {/* Left Panel Zone */}
            <div className="pointer-events-auto flex h-full w-[380px] flex-col gap-4 overflow-hidden">
                {leftSidebar}
            </div>

            {/* Center Area (Empty for Map Interaction) */}
            <div className="flex-1" />

            {/* Right Panel Zone */}
            <div className="pointer-events-auto flex h-full w-[350px] flex-col gap-4 overflow-hidden">
                {rightSidebar}
            </div>
        </div>
      </div>
    </div>
  );
};
