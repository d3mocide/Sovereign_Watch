import { useState, useEffect } from 'react';

export interface SystemHealth {
    latency: number;
    status: 'online' | 'degraded' | 'offline';
    lastCheck: number;
}

export const useSystemHealth = (intervalMs = 5000) => {
    const [health, setHealth] = useState<SystemHealth>(() => ({
        latency: 0,
        status: 'online', // Assume online initially to prevent flash of error
        lastCheck: Date.now()
    }));

    useEffect(() => {
        const checkHealth = async () => {
            const start = performance.now();
            try {
                // Keep heartbeat separate from mission-area polling to avoid noisy config logs.
                const response = await fetch('/health', { cache: 'no-store' });
                if (!response.ok) {
                    throw new Error('Health check failed');
                }
                const end = performance.now();
                const latency = Math.round(end - start);
                
                let status: 'online' | 'degraded' | 'offline' = 'online';
                if (latency > 200) status = 'degraded';
                
                setHealth({
                    latency,
                    status,
                    lastCheck: Date.now()
                });
            } catch {
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
