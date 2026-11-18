export function matchesCanvasSession(expectedUserId: string | null, expectedEpoch: number | null, current: { ready: boolean; user: { id: string } | null; sessionEpoch: number }) {
    return current.ready && expectedEpoch !== null && current.sessionEpoch === expectedEpoch && (current.user?.id ?? null) === expectedUserId;
}

export function matchesPresentedSession(expectedUserId: string | null, expectedEpoch: number, presented: string, current: { ready: boolean; user: { id: string } | null; sessionEpoch: number }, accountActive: boolean) {
    return presented === `${expectedEpoch}:${expectedUserId ?? ""}` && accountActive && matchesCanvasSession(expectedUserId, expectedEpoch, current);
}
