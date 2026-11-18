import { parseProduction, type ProductionDocument } from './production';
type Change = { path: string[]; before?: unknown; after?: unknown };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const scope = (p: ProductionDocument) => ({ composition: p.composition, subtitles: p.subtitles, shotIds: p.shots.map(shot => shot.shotId) });
export function productionChanges(before: ProductionDocument, after: ProductionDocument): Change[] {
    const changes: Change[] = [];
    const diff = (a: unknown, b: unknown, path: string[]) => {
        if (equal(a,b)) return;
        if (object(a) && object(b)) for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) diff(a[key],b[key],[...path,key]);
        else changes.push({ path, before: a, after: b });
    };
    diff(scope(before),scope(after),[]);
    return changes;
}
export function undoProductionChanges(value: unknown, changes: Change[]): ProductionDocument {
    const next = structuredClone(parseProduction(value));
    const editable = scope(next);
    for (const change of changes) {
        let parent: any = editable;
        for (const key of change.path.slice(0,-1)) { parent = parent?.[key]; if (!parent) throw new Error('编排字段已删除，无法自动撤销'); }
        const key = change.path.at(-1)!;
        if (!equal(parent[key],change.after)) throw new Error('编排字段已有后续修改，无法自动撤销');
        if (change.before === undefined) delete parent[key]; else parent[key] = structuredClone(change.before);
    }
    if (editable.shotIds.length !== next.shots.length || editable.shotIds.some(id => !next.shots.some(shot => shot.shotId === id))) throw new Error('镜头列表已变化，无法撤销排序');
    next.shots = editable.shotIds.map(id => next.shots.find(shot => shot.shotId === id)!);
    next.composition = editable.composition; next.subtitles = editable.subtitles;
    return parseProduction(next);
}
