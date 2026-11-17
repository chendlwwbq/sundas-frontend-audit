type Source = { id: string; type: string };

// A context-menu action belongs to its clicked node unless it is part of the selection.
export function upscaleSources<T extends Source>(source: T | null | undefined, selected?: T[]): T[] {
    const media = (node: T) => node.type === 'image' || node.type === 'video';
    const selection = selected?.filter(media) ?? [];
    const candidates = source && media(source) && !selection.some(node => node.id === source.id) ? [source] : selection;
    return [...new Map(candidates.map(node => [node.id, node])).values()];
}
