import type { DirectorCamera, DirectorKeyframe } from "../web/src/types/director";

export type DirectorMotionPresetKind = "orbit" | "half_arc" | "push_in" | "pull_out" | "lift" | "truck" | "spiral";

export function buildDirectorMotionPresetKeyframes(kind: DirectorMotionPresetKind, action: "replace" | "append", camera: DirectorCamera, duration: number, createId: () => string): { keyframes: DirectorKeyframe[]; duration: number } {
    const previous = action === "append" ? [...camera.keyframes].sort((a, b) => a.time - b.time) : [];
    const last = previous.at(-1);
    const start = last?.transform || camera.transform;
    const [x, y, z] = start.position;
    const target = last?.target || camera.target;
    const fov = last?.fov ?? camera.fov;
    const [targetX, targetY, targetZ] = target;
    const forward = [targetX - x, targetY - y, targetZ - z];
    const forwardLength = Math.hypot(...forward) || 1;
    const [forwardX, forwardY, forwardZ] = forward.map((axis) => axis / forwardLength);
    const horizontalLength = Math.hypot(forwardX, forwardZ) || 1;
    const rightX = -forwardZ / horizontalLength;
    const rightZ = forwardX / horizontalLength;
    const startPosition: [number, number, number] = [x, y, z];
    const orbit = (steps: number, radians: number, rise: number): [number, number, number][] => Array.from({ length: steps + 1 }, (_, index) => {
        if (index === 0) return startPosition;
        if (index === steps && radians === 2 * Math.PI && rise === 0) return startPosition;
        const angle = radians * index / steps;
        const radialX = x - targetX;
        const radialZ = z - targetZ;
        return [targetX + radialX * Math.cos(angle) - radialZ * Math.sin(angle), y + rise * index / steps, targetZ + radialX * Math.sin(angle) + radialZ * Math.cos(angle)];
    });
    const positions: [number, number, number][] = kind === "orbit" ? orbit(8, 2 * Math.PI, 0)
        : kind === "half_arc" ? orbit(4, Math.PI, 0)
        : kind === "spiral" ? orbit(8, 2 * Math.PI, 2)
        : kind === "push_in" ? [startPosition, [x + forwardX * 2, y + forwardY * 2, z + forwardZ * 2]]
        : kind === "pull_out" ? [startPosition, [x - forwardX * 2, y - forwardY * 2, z - forwardZ * 2]]
        : kind === "lift" ? [startPosition, [x, y + 2, z]]
        : [startPosition, [x + rightX * 2, y, z + rightZ * 2]];
    const startTime = last?.time || 0;
    const generated = positions.map((position, index) => ({
        id: createId(),
        time: startTime + 2 * index / (positions.length - 1),
        transform: { ...start, position },
        target: [...target] as [number, number, number],
        fov,
        easing: (positions.length > 2 ? "smooth" : "linear") as DirectorKeyframe["easing"],
    }));
    const keyframes = previous.length ? [...previous, ...generated.slice(1)] : generated;
    return { keyframes, duration: Math.max(duration, startTime + 2) };
}
