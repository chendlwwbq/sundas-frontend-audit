let playingIds: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

export function getPlayingCanvasNodeIds() { return playingIds; }
export function subscribeCanvasPlayback(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; }

/** Active playback remains mounted when panned offscreen; paused offscreen players can be released. */
export function setCanvasNodePlaying(id: string, playing: boolean) {
    if (playingIds.has(id) === playing) return;
    const next = new Set(playingIds);
    if (playing) next.add(id); else next.delete(id);
    playingIds = next;
    listeners.forEach((listener) => listener());
}

export function releaseCanvasMedia(media: HTMLMediaElement) {
    media.pause();
    media.removeAttribute("src");
    media.load();
}
