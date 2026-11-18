import type { ReactNode } from "react";

import { DirectorScreenshotGallery } from "@/components/canvas/director/director-screenshot-gallery";
import { releaseDirectorFocusAfterPointer } from "@/lib/canvas/director/director-shortcuts";
import type { DirectorScene, DirectorScreenshot } from "@/types/director";

export type DirectorCameraInspectorTab = "properties" | "motion" | "screenshots";

/** 截图属于镜头，但截图页按摄影机展示；同一机位的多个镜头不可丢失。 */
export function groupDirectorCameraScreenshots(scene: Pick<DirectorScene, "cameras" | "shots">): Array<{ cameraId: string; cameraName: string; screenshots: DirectorScreenshot[] }> {
    return scene.cameras.map((camera) => ({
        cameraId: camera.id,
        cameraName: camera.name,
        screenshots: scene.shots.filter((shot) => shot.cameraId === camera.id).flatMap((shot) => shot.screenshots || []),
    })).filter((group) => group.screenshots.length > 0);
}

export function DirectorCameraScreenshotTabs({ scene, tab = "properties", motionTabVisible = true, onTabChange, motionContent, onRemoveScreenshot, children }: { scene: Pick<DirectorScene, "cameras" | "shots">; tab?: DirectorCameraInspectorTab; motionTabVisible?: boolean; onTabChange?: (tab: DirectorCameraInspectorTab) => void; motionContent?: ReactNode; onRemoveScreenshot?: (screenshot: DirectorScreenshot) => void; children: ReactNode }) {
    const groups = groupDirectorCameraScreenshots(scene);
    const tabs = [
        { key: "properties" as const, label: "属性" },
        ...(motionTabVisible ? [{ key: "motion" as const, label: "运动轨迹" }] : []),
        { key: "screenshots" as const, label: "截图" },
    ];
    return <div className="min-h-full" aria-label="摄像机检查器">
        <header className="dcp-tabs-head"><h2>摄像机</h2></header>
        <div role="tablist" aria-label="摄像机面板" className="dcp-tablist">
            {tabs.map((item) => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} className={`dcp-tab${tab === item.key ? " is-active" : ""}`} onClick={(event) => { onTabChange?.(item.key); releaseDirectorFocusAfterPointer(event); }}>{item.label}</button>)}
        </div>
        <div role="tabpanel" className={tab === "properties" || tab === "motion" ? "dcp-tabpanel" : undefined} aria-label={tab === "properties" ? "属性" : tab === "motion" ? "运动轨迹" : "截图"}>
            {tab === "properties" ? children : tab === "motion" ? motionContent : <div className="dcp-tabpanel-empty">{groups.length ? groups.map((group) => <DirectorScreenshotGallery key={group.cameraId} title={`${group.cameraName}截图`} screenshots={group.screenshots} compact onRemove={onRemoveScreenshot} />) : <p>暂无截图</p>}</div>}
        </div>
    </div>;
}
