import { useState, useEffect, useRef } from 'react';
import { getMissionArea } from '../api/missionArea';

export interface SystemHealth {
    latency: number;
    status: 'online' | 'degraded' | 'offline';
    lastCheck: number;
}

export const useSystemHealth = (intervalMs = 5000) => {
    const [health, setHealth] = useState<SystemHealth>({
        latency: 0,
        status: 'online', // Assume online initially to prevent flash of error
        lastCheck: Date.now()
    });

    useEffect(() => {
        const checkHealth = async () => {
            const start = performance.now();
            try {
                // Use mission area fetch as a lightweight heartbeat
                await getMissionArea();
                const end = performance.now();
                const latency = Math.round(end - start);
                
                let status: 'online' | 'degraded' | 'offline' = 'online';
                if (latency > 200) status = 'degraded';
                if (latency > 1000) status = 'degraded'; // Strict
                
                setHealth({
                    latency,
                    status,
                    lastCheck: Date.now()
                });
            } catch (error) {
                setHealth({
                    latency: 0, // No response
                    status: 'offline',
                    lastCheck: Date.now()
                });
            }
        };

        checkHealth(); // Initial check
        const timer = setInterval(checkHealth, intervalMs);
        return () => clearInterval(timer);
    }, [intervalMs]);

    return health;
};
