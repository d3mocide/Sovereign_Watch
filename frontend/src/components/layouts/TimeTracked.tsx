import { useEffect, useState } from 'react';

export const TimeTracked = ({ lastSeen }: { lastSeen: number }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const update = () => {
            setElapsed((Date.now() - lastSeen) / 1000);
        };
        update(); // Initial
        const timer = setInterval(update, 100);
        return () => clearInterval(timer);
    }, [lastSeen]);

    return <>{elapsed.toFixed(1)}s</>;
};
