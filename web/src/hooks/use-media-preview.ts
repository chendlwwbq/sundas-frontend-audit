import { useEffect, useRef, useState } from 'react';
import { MediaPreviewCache, ownedPreviewKey } from '@/lib/media-preview-cache';
import { fetchMediaPreview } from '@/services/api/media-preview';
import { useAuthStore } from '@/stores/use-auth-store';

const previews = new MediaPreviewCache();
export function useMediaPreview(content?: string) {
    const [pageVisible,setPageVisible]=useState(document.visibilityState!=='hidden');
    useEffect(()=>{const changed=()=>setPageVisible(document.visibilityState!=='hidden');document.addEventListener('visibilitychange',changed);return()=>document.removeEventListener('visibilitychange',changed);},[]);
    const userId = useAuthStore(state => state.ready ? state.user?.id : undefined);
    const epoch = useAuthStore(state => state.sessionEpoch);
    const objectKey = ownedPreviewKey(content, window.location.origin);
    const identity = userId && objectKey ? `${userId}:${epoch}:${objectKey}` : '';
    const [snapshot, setSnapshot] = useState<{ identity: string; url?: string; error?: string }>({ identity: '' });
    const retry = useRef<() => void>(() => {});
    useEffect(() => {
        if (!identity || !objectKey || !userId || !pageVisible) return;
        const subscription = previews.acquire(identity, (signal,manual) => fetchMediaPreview(objectKey, userId, signal,manual), value => setSnapshot({ identity, ...value }));
        retry.current = subscription.retry;
        return () => { subscription.release(); retry.current = () => {}; };
    }, [identity, objectKey, userId,pageVisible]);
    return { url: snapshot.identity === identity ? snapshot.url : undefined, error: snapshot.identity === identity ? snapshot.error : undefined,
        cloud: Boolean(identity), retry: () => retry.current() };
}
