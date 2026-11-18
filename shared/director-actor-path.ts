import type { DirectorKeyframe, DirectorObject, DirectorVec3 } from "../web/src/types/director";
export type DirectorActorPathKind = "line" | "ring" | "rectangle";

export function buildDirectorActorPath(object: DirectorObject, kind: DirectorActorPathKind, duration: number, createId: () => string, startTime = 0): DirectorObject {
    const seconds = Number.isFinite(duration) && duration > 0 ? duration : 10;
    const [x, y, z] = object.transform.position;
    const positions: DirectorVec3[] = kind === "line"
        ? [[x, y, z], [x, y, z + 4]]
        : kind === "ring"
            ? Array.from({ length: 33 }, (_, index) => {
                const angle = index * Math.PI / 16;
                return [x - 2 + 2 * Math.cos(angle), y, z + 2 * Math.sin(angle)];
            })
            : [[x, y, z], [x + 4, y, z], [x + 4, y, z + 3], [x, y, z + 3], [x, y, z]];
    const center: DirectorVec3 = kind === "line" ? [x, y, z + 2] : kind === "ring" ? [x - 2, y, z] : [x + 2, y, z + 1.5];
    const keyframes: DirectorKeyframe[] = positions.map((position, index) => ({
        id: createId(),
        time: startTime + (index === positions.length - 1 ? seconds : seconds * index / (positions.length - 1)),
        transform: { ...object.transform, position },
        easing: kind === "ring" ? "smooth" : "linear",
    }));
    const withPath: DirectorObject = {
        ...object,
        keyframes,
        motionPath: { kind, duration: seconds, ...(startTime ? { startTime } : {}), facePath: true, transform: { position: center, rotation: [0, 0, 0], scale: [1, 1, 1] }, originalKeyframes: object.motionPath?.originalKeyframes || object.keyframes, ...(kind === "ring" ? { controlKeyframeIds: [keyframes[0].id, keyframes[16].id, keyframes[32].id] } : {}) },
    };
    return setDirectorActorPathFacing(withPath, true);
}


export function setDirectorActorPathFacing(object: DirectorObject, facing: boolean): DirectorObject {
    if (!object.motionPath) return object;
    const keyframes = object.keyframes.map((frame, index, all) => {
        const from = all[index === all.length - 1 && object.motionPath?.kind === "ring" ? 0 : index].transform.position;
        const to = all[index === all.length - 1 ? index === 0 ? 0 : index - 1 : index + 1].transform.position;
        const dx = index === all.length - 1 ? from[0] - to[0] : to[0] - from[0];
        const dz = index === all.length - 1 ? from[2] - to[2] : to[2] - from[2];
        const yaw = Math.hypot(dx, dz) > 1e-6 ? Math.atan2(dx, dz) : object.transform.rotation[1];
        return { ...frame, transform: { ...frame.transform, rotation: facing ? [object.transform.rotation[0], yaw, object.transform.rotation[2]] as DirectorVec3 : [...object.transform.rotation] as DirectorVec3 } };
    });
    return { ...object, motionPath: { ...object.motionPath, facePath: facing }, keyframes };
}
