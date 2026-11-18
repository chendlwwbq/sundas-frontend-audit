import { useDeferredValue, useEffect, useState } from 'react';
import { fetchCreditEstimate, type CreditEstimate } from '@/services/api/pricing';

export function useCreditEstimate(model: string, mode: 'image' | 'video' | 'text' | 'audio', seconds: number, resolution: string, session: string, inputLength = 0, routeId = '') {
    const deferredLength = useDeferredValue(inputLength);
    const key = JSON.stringify([model, mode, seconds, resolution, session, deferredLength, routeId]);
    const [result, setResult] = useState<{ key: string; data?: CreditEstimate; error?: boolean }>({ key: '' });
    useEffect(() => {
        if (!model) return;
        const controller = new AbortController();
        void fetchCreditEstimate({ model, mode, seconds: String(seconds), resolution, ...(mode === 'audio' ? { inputLength: String(deferredLength) } : {}), ...(mode === 'video' && routeId ? { routeId } : {}) }, controller.signal)
            .then(data => { if (!controller.signal.aborted) setResult({ key, data }); })
            .catch(() => { if (!controller.signal.aborted) setResult({ key, error: true }); });
        return () => controller.abort();
    }, [key, model, mode, seconds, resolution, deferredLength, routeId]);
    return { data: result.key === key ? result.data : undefined, error: result.key === key && result.error, loading: Boolean(model && (result.key !== key)), hasModel: Boolean(model) };
}
