import { useEffect, useState } from "react";

const PAGE_SIZE = 30;

// Render recent records first so long histories do not mount every media item.
export function useVisibleRecords<T extends { id: string }>(logs: T[], owner: string | undefined, recordId: string | null) {
    const [limit, setLimit] = useState(PAGE_SIZE);
    useEffect(() => { setLimit(PAGE_SIZE); }, [owner]);
    useEffect(() => {
        if (!recordId) return;
        const index = logs.findIndex((item) => item.id === recordId);
        if (index >= 0) setLimit((current) => Math.max(current, index + 1));
    }, [logs, recordId]);

    const showEarlier = () => {
        const anchor = logs[Math.min(limit, logs.length) - 1]?.id;
        const element = anchor ? document.getElementById(`creation-record-${anchor}`) : null;
        const top = element?.getBoundingClientRect().top;
        let scroller = element?.parentElement ?? null;
        while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller = scroller.parentElement;
        setLimit((current) => current + PAGE_SIZE);
        if (element && scroller && top != null) requestAnimationFrame(() => requestAnimationFrame(() => {
            if (element.isConnected) scroller.scrollTop += element.getBoundingClientRect().top - top;
        }));
    };
    return { records: logs.slice(0, limit).reverse(), hasEarlier: logs.length > limit, showEarlier };
}
