import type { DirectorScene } from '../web/src/types/director';
import { validateDirectorSceneSequence } from './director-sequence';

export type DirectorChange = { collection?: 'cameras' | 'objects'; id?: string; field?: string; before?: unknown; after?: unknown };
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
export function directorChanges(before: DirectorScene, after: DirectorScene): DirectorChange[] {
    const changes: DirectorChange[] = [];
    if (!same(before.cameraSequence, after.cameraSequence)) changes.push({ field: 'cameraSequence', before: before.cameraSequence, after: after.cameraSequence });
    for (const collection of ['cameras', 'objects'] as const) {
        for (const item of after[collection]) {
            const original = before[collection].find(entry => entry.id === item.id);
            if (!original) { changes.push({ collection, id: item.id, after: item }); continue; }
            for (const field of new Set([...Object.keys(original), ...Object.keys(item)])) {
                const oldValue = (original as any)[field], newValue = (item as any)[field];
                if (!same(oldValue, newValue)) changes.push({ collection, id: item.id, field, before: oldValue, after: newValue });
            }
        }
    }
    return changes;
}
/** Undo a persisted, server-generated diff, never a model-provided patch. */
export function undoDirectorChanges(scene: DirectorScene, changes: DirectorChange[]): DirectorScene {
    const next = structuredClone(scene);
    for (const change of [...changes].sort((a, b) => Number(Boolean(a.collection)) - Number(Boolean(b.collection)))) {
        const list = change.collection ? next[change.collection] : undefined;
        const target = list ? list.find(item => item.id === change.id) : next;
        if (!target) throw new Error('撤销目标已删除，请手动核对');
        if (!change.field) {
            if (!same(target, change.after)) throw new Error('新增对象已有后续修改，无法自动撤销');
            if (change.collection === 'cameras' && (next.shots.some(shot => shot.cameraId === change.id) || next.cameraSequence?.cuts.some(cut => cut.cameraId === change.id))) throw new Error('新增机位已被其他镜头引用，无法自动撤销');
            list!.splice(list!.findIndex(item => item.id === change.id), 1);
        } else {
            const record = target as unknown as Record<string, unknown>;
            if (!same(record[change.field], change.after)) throw new Error('相关字段已有后续修改，原操作不能自动撤销');
            if (change.before === undefined) delete record[change.field];
            else record[change.field] = structuredClone(change.before);
        }
    }
    validateDirectorSceneSequence(next);
    return next;
}
