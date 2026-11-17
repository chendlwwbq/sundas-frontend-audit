import { useEffect, useMemo, useState } from "react";

/** Live countdown for promo campaigns; returns null when no deadline is configured. */
export function useCountdown(value: string | null) {
    const end = useMemo(() => (value ? new Date(value).getTime() : null), [value]);
    const [now, setNow] = useState(() => Date.now());

    useEffect(() => {
        if (!end) return;
        setNow(Date.now());
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [end]);

    if (!end) return null;
    const remaining = Math.max(0, end - now);
    return {
        expired: remaining <= 0,
        days: Math.floor(remaining / 86_400_000),
        hours: Math.floor((remaining % 86_400_000) / 3_600_000),
        minutes: Math.floor((remaining % 3_600_000) / 60_000),
        seconds: Math.floor((remaining % 60_000) / 1000),
    };
}
