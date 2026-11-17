const KEY = "sundas:session-changed";
const SOURCE = `${Date.now()}:${Math.random()}`;

export function broadcastSessionChange() {
    if (typeof window === "undefined") return;
    const eventId = `${SOURCE}:${Date.now()}:${Math.random()}`;
    try { localStorage.setItem(KEY, eventId); } catch { /* 继续尝试广播通道。 */ }
    try {
        if (typeof BroadcastChannel !== "undefined") {
            const channel = new BroadcastChannel(KEY);
            channel.postMessage(eventId);
            channel.close();
        }
    } catch { /* 两种通知均不可用时依赖服务端账户校验。 */ }
}

export function subscribeSessionChanges(onChange: () => void) {
    if (typeof window === "undefined") return () => {};
    let lastEvent = "";
    const receive = (eventId: unknown) => {
        if (typeof eventId !== "string" || !eventId || eventId.startsWith(`${SOURCE}:`) || eventId === lastEvent) return;
        lastEvent = eventId;
        onChange();
    };
    const listener = (event: StorageEvent) => { if (event.key === KEY) receive(event.newValue); };
    window.addEventListener("storage", listener);
    let channel: BroadcastChannel | undefined;
    try {
        if (typeof BroadcastChannel !== "undefined") {
            channel = new BroadcastChannel(KEY);
            channel.onmessage = (event) => receive(event.data);
        }
    } catch { channel = undefined; }
    return () => { window.removeEventListener("storage", listener); channel?.close(); };
}
