import type { DirectorScene, DirectorVec3, DirectorPose } from '../web/src/types/director';
import { clampDirectorSceneToGround } from './director-ground-clamp';
import { buildDirectorMotionPresetKeyframes, type DirectorMotionPresetKind } from './director-motion-presets';
import { buildDirectorActorPath, setDirectorActorPathFacing, type DirectorActorPathKind } from './director-actor-path';
import { editDirectorSequence, validateDirectorSceneSequence, type DirectorSequenceCommand, type DirectorSequence } from './director-sequence';

export type DirectorCommand =
    | { type: 'sequence.create'; sequence: DirectorSequence }
    | { type: 'sequence.edit'; command: DirectorSequenceCommand }
    | { type: 'camera.clone'; sourceId: string; id: string; name: string }
    | { type: 'camera.preset'; cameraId: string; id: string; preset: DirectorMotionPresetKind; startTime: number; endTime: number }
    | { type: 'actor.frame'; objectId: string; id: string; time: number; position: DirectorVec3; rotation: DirectorVec3 }
    | { type: 'actor.pose'; objectId: string; pose: DirectorPose }
    | { type: 'actor.path'; objectId: string; id: string; kind: DirectorActorPathKind; startTime: number; endTime: number; facePath: boolean }
    | { type: 'camera.frame'; cameraId: string; id: string; time: number; position: DirectorVec3; target: DirectorVec3; fov: number };

/** One validated batch on a clone; callers commit via project CAS. */
export function applyDirectorCommands(scene: DirectorScene, commands: DirectorCommand[]): DirectorScene {
    const next = structuredClone(scene);
    const objectIds = new Set<string>();
    const cameraIds = new Set<string>();
    validateDirectorSceneSequence(next);
    for (const command of commands) {
        if (command.type === 'sequence.create') {
            if (next.cameraSequence) throw new Error('场景已有序列，请编辑现有切点');
            next.cameraSequence = structuredClone(command.sequence);
        } else if (command.type === 'sequence.edit') {
            if (!next.cameraSequence) throw new Error('场景尚未建立序列');
            next.cameraSequence = editDirectorSequence(next.cameraSequence, command.command, next.cameras.map(camera => camera.id));
        } else if (command.type === 'camera.clone') {
            const source = next.cameras.find(camera => camera.id === command.sourceId);
            if (!source || source.locked) throw new Error('源机位不存在或已锁定');
            if (!command.id || !command.name || next.cameras.some(camera => camera.id === command.id)) throw new Error('新机位标识无效或重复');
            next.cameras.push({ ...structuredClone(source), id: command.id, name: command.name });
            cameraIds.add(command.id);
        } else if (command.type === 'camera.preset') {
            const camera = next.cameras.find(camera => camera.id === command.cameraId);
            if (!camera || camera.locked) throw new Error('机位不存在或已锁定');
            if (!command.id || !Number.isFinite(command.startTime) || !Number.isFinite(command.endTime) || command.startTime < 0 || command.endTime <= command.startTime) throw new Error('运镜必须指定有效的全局起止时间');
            if (camera.keyframes.some(frame => frame.time > command.startTime && frame.time <= command.endTime)) throw new Error('运镜范围内已有关键帧，请先在导演台处理，或复制机位后重新安排');
            const start = camera.keyframes.find(frame => frame.time === command.startTime);
            if (camera.keyframes.length && !start) throw new Error('请先明确起始时间的机位关键帧，再应用运镜预设');
            let index = 0;
            const generated = buildDirectorMotionPresetKeyframes(command.preset, 'replace', { ...camera, transform: start?.transform || camera.transform, target: start?.target || camera.target, fov: start?.fov ?? camera.fov }, command.endTime, () => `${command.id}:${index++}`).keyframes.map(frame => ({ ...frame, time: command.startTime + frame.time / 2 * (command.endTime - command.startTime), positionKeyed: true, rotationKeyed: false }));
            if (generated.some(frame => camera.keyframes.some(old => old.id === frame.id))) throw new Error('运镜关键帧标识重复，请重新核对方案');
            camera.keyframes = [...camera.keyframes, ...generated.filter((_, index) => !start || index !== 0)].sort((a,b) => a.time-b.time);
            camera.lookAtMode = 'coordinates';
            delete camera.lookAtObjectId;
            cameraIds.add(camera.id);
        } else if (command.type === 'actor.frame' || command.type === 'actor.pose' || command.type === 'actor.path') {
            const actor = next.objects.find(object => object.id === command.objectId);
            if (!actor || actor.locked || !(actor.kind === 'actor' || actor.primitive === 'character' || actor.kind === 'model')) throw new Error('人物不存在、已锁定或类型不支持');
            if (command.type === 'actor.path') {
                if (!command.id || !Number.isFinite(command.startTime) || !Number.isFinite(command.endTime) || command.startTime < 0 || command.endTime <= command.startTime) throw new Error('人物路径必须指定有效的全局起止时间');
                let index = 0;
                const path = setDirectorActorPathFacing(buildDirectorActorPath(actor, command.kind, command.endTime - command.startTime, () => `${command.id}:${index++}`, command.startTime), command.facePath);
                if (path.keyframes.some(frame => actor.keyframes.some(old => old.id === frame.id))) throw new Error('路径关键帧标识重复，请重新核对方案');
                Object.assign(actor, path, { animationTrackEnabled: true });
                objectIds.add(actor.id);
            } else if (command.type === 'actor.pose') actor.pose = command.pose;
            else {
                if (actor.motionPath) throw new Error('人物已有运动路径，请先在导演台确认移除路径后再安排关键帧');
                if (!Number.isFinite(command.time) || command.time < 0 || ![command.position, command.rotation].every(vector => vector.length === 3 && vector.every(Number.isFinite))) throw new Error('人物关键帧参数无效');
                if (actor.keyframes.some(frame => frame.id !== command.id && frame.time === command.time)) throw new Error('该时刻已有其他人物关键帧');
                const existing = actor.keyframes.find(frame => frame.id === command.id);
                actor.keyframes = [...actor.keyframes.filter(frame => frame.id !== command.id), { ...existing, id: command.id, time: command.time, transform: { ...structuredClone(existing?.transform || actor.transform), position: command.position, rotation: command.rotation }, positionKeyed: true, rotationKeyed: true, scaleKeyed: existing?.scaleKeyed ?? false }].sort((a, b) => a.time - b.time);
                actor.animationTrackEnabled = true;
                objectIds.add(actor.id);
            }
        } else {
            const camera = next.cameras.find(camera => camera.id === command.cameraId);
            if (!camera || camera.locked) throw new Error('机位不存在或已锁定');
            if (!Number.isFinite(command.time) || command.time < 0 || !Number.isFinite(command.fov) || command.fov <= 0 || command.fov >= 180
                || ![command.position, command.target].every(vector => vector.length === 3 && vector.every(Number.isFinite))) throw new Error('机位关键帧参数无效');
            const existing = camera.keyframes.find(frame => frame.id === command.id);
            if (camera.keyframes.some(frame => frame.id !== command.id && frame.time === command.time)) throw new Error('该时刻已有其他关键帧，请明确修改目标');
            const frame = { ...existing, id: command.id, time: command.time, transform: { ...structuredClone(existing?.transform || camera.transform), position: command.position }, target: command.target, fov: command.fov, positionKeyed: true, rotationKeyed: existing?.rotationKeyed ?? false };
            camera.keyframes = [...camera.keyframes.filter(frame => frame.id !== command.id), frame].sort((a, b) => a.time - b.time);
            camera.lookAtMode = 'coordinates';
            delete camera.lookAtObjectId;
            cameraIds.add(camera.id);
        }
        validateDirectorSceneSequence(next);
    }
    return clampDirectorSceneToGround(next, { objectIds, cameraIds });
}
