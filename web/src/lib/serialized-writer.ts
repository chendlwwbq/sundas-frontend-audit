export function createSerializedWriter() {
    let tail: Promise<unknown> = Promise.resolve();
    return {
        write<T>(operation: () => Promise<T>): Promise<T> {
            const result = tail.then(operation);
            tail = result.catch(() => undefined);
            return result;
        },
        async flush() { await tail; },
    };
}
