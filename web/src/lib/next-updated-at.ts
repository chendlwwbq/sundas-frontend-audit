export function nextUpdatedAt(previous: string) {
    const old = Date.parse(previous);
    return new Date(Math.max(Date.now(), Number.isFinite(old) ? old + 1 : 0)).toISOString();
}
