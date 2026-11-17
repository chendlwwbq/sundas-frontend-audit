import type { DirectorScene } from "@/types/director";
import { directorGroundSettings } from "./director-ground";
import { directorStagePoint, directorStageTransform } from "./director-stage-transform";
export * from "../../../../../shared/director-ground-clamp";

/** 地面在世界坐标里的高度：舞台有平移/旋转/缩放时，本地 ground.height 不能直接拿来比。 */
export function directorGroundWorldY(scene: Pick<DirectorScene, "ground" | "stageTransform">): number {
    const { height } = directorGroundSettings(scene);
    const stage = directorStageTransform(scene);
    if (stage.scale === 1 && stage.position.every((value) => value === 0) && stage.rotation.every((value) => value === 0)) return height;
    return directorStagePoint(stage, [0, height, 0])[1];
}
