export function createGenerationAccountBindings() {
    const owners = new WeakMap<AbortSignal, string | null>();
    const epochs = new WeakMap<AbortSignal, number | undefined>();
    return {
        bind(signal: AbortSignal, owner: string | null, epoch?: number) {
            if (!owners.has(signal)) { owners.set(signal, owner); epochs.set(signal, epoch); }
        },
        owner(signal: AbortSignal) { return owners.get(signal) ?? null; },
        isOwner(signal: AbortSignal, currentOwner: string | null, epoch?: number) {
            return owners.has(signal) && owners.get(signal) !== null && owners.get(signal) === currentOwner && epochs.get(signal) === epoch;
        },
        isCurrent(signal: AbortSignal, currentOwner: string | null, epoch?: number) {
            return !signal.aborted && owners.has(signal) && owners.get(signal) !== null && owners.get(signal) === currentOwner && epochs.get(signal) === epoch;
        },
        options(signal: AbortSignal) { return { signal, expectedUserId: owners.get(signal) ?? "anonymous", surface: "canvas" as const }; },
    };
}

export function guardGenerationUpdate<T>(current: () => boolean, update: T | ((previous: T) => T)) {
    return (previous: T): T => current() ? (typeof update === "function" ? (update as (value: T) => T)(previous) : update) : previous;
}
