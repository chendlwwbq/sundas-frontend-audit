import { saveAs } from "file-saver";

import i18n from "@/i18n";
import { createZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { useAuthStore } from "@/stores/use-auth-store";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";
import type { CanvasExportAsset, CanvasExportFile } from "@/types/canvas-export";
import type { CanvasProject } from "@/stores/canvas/use-canvas-store";
import { CanvasNodeType, type CanvasNodeData } from "@/types/canvas";
import { collectCanvasPackageMedia } from './canvas-package';
import { parseProduction } from '../../../../shared/production';

export type CanvasExportProgress = {
    stage: "collect" | "zip";
    completed: number;
    total: number;
};

export type CanvasExportOptions = {
    onProgress?: (progress: CanvasExportProgress) => void;
};

export function formatCanvasExportProgress(progress: CanvasExportProgress, fallbackLabel: string) {
    if (!progress.total) return fallbackLabel;
    return progress.stage === "collect"
        ? `正在收集素材 (${progress.completed}/${progress.total})...`
        : `正在打包压缩 (${progress.completed}/${progress.total})...`;
}

let exportInFlight = false;

async function runWithExportLock<T>(task: () => Promise<T>): Promise<T> {
    if (exportInFlight) throw new Error("正在导出中，请等待当前导出完成");
    exportInFlight = true;
    try {
        return await task();
    } finally {
        exportInFlight = false;
    }
}

export async function exportCanvasProjects(projects: CanvasProject[], fileName = i18n.t("canvas.export.defaultProjectName"), options?: CanvasExportOptions) {
    return runWithExportLock(async () => {
        const checkSession = captureExportSession();
        const zipFiles: { name: string; data: BlobPart }[] = [];
        const mediaPerProject = projects.map((project) => collectCanvasPackageMedia(project));
        const total = mediaPerProject.reduce((sum, list) => sum + list.length, 0);
        let completed = 0;
        options?.onProgress?.({ stage: "collect", completed: 0, total });

        const exportedProjects = await Promise.all(
            projects.map(async (project, projectIndex) => {
                if (project.production) parseProduction(project.production);
                const files: CanvasExportAsset[] = [];
                await Promise.all(
                    mediaPerProject[projectIndex].map(async (storageKey, index) => {
                        checkSession();
                        const blob = storageKey.startsWith("/media/") ? await downloadPackageMedia(storageKey, checkSession) : storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                        if (!blob) throw new Error("画布引用的本地素材缺失，无法完整导出；请先恢复素材后重试。");
                        const path = `projects/${project.id}/files/${index}.${fileExtension(blob.type, storageKey)}`;
                        files.push({ storageKey, path, mimeType: blob.type || "application/octet-stream", bytes: blob.size });
                        zipFiles.push({ name: path, data: blob });
                        completed += 1;
                        options?.onProgress?.({ stage: "collect", completed, total });
                    }),
                );
                return { project, files };
            }),
        );

        const data: CanvasExportFile = { app: "sundas", version: 4, exportedAt: new Date().toISOString(), projects: exportedProjects };
        checkSession();
        const allFiles = [{ name: "projects.json", data: JSON.stringify(data, null, 2) }, ...zipFiles];
        options?.onProgress?.({ stage: "zip", completed: 0, total: allFiles.length });
        const zip = await createZip(allFiles, (done, zipTotal) => {
            options?.onProgress?.({ stage: "zip", completed: done, total: zipTotal });
        });
        checkSession();
        saveAs(zip, `${safeFileName(fileName)}.zip`);
    });
}

export async function exportCanvasNodes(nodes: CanvasNodeData[], fileName = i18n.t("canvas.export.defaultNodesName"), options?: CanvasExportOptions) {
    return runWithExportLock(async () => {
        const checkSession = captureExportSession();
        const zipFiles: { name: string; data: BlobPart }[] = [];
        const used = new Set<string>();
        const total = nodes.length;
        let completed = 0;
        options?.onProgress?.({ stage: "collect", completed: 0, total });

        const uniqueName = (base: string, ext: string) => {
            const safe = safeFileName(base) || i18n.t("canvas.export.item");
            let name = `${safe}.${ext}`;
            for (let i = 1; used.has(name); i += 1) name = `${safe}-${i}.${ext}`;
            used.add(name);
            return name;
        };

        const reportNodeCollected = () => {
            completed += 1;
            options?.onProgress?.({ stage: "collect", completed, total });
        };

        await Promise.all(
            nodes.map(async (node) => {
                const title = node.title || node.type;
                const storageKey = node.metadata?.storageKey || "";
                const content = node.metadata?.content;
                try {
                    if (storageKey) {
                        const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                        if (blob) return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
                        if (content?.startsWith("/media/")) {
                            const remoteBlob = await downloadPackageMedia(content, checkSession);
                            return void zipFiles.push({ name: uniqueName(title, fileExtension(remoteBlob.type, content)), data: remoteBlob });
                        }
                    }
                    if (node.type === CanvasNodeType.Text) return void zipFiles.push({ name: uniqueName(title, "txt"), data: content || node.metadata?.prompt || "" });
                    if (content && content.startsWith("data:")) {
                        const blob = await (await fetch(content)).blob();
                        return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey || content)), data: blob });
                    }
                    if (storageKey) throw new Error("节点引用的本地素材缺失，无法完整导出；请先恢复素材后重试。");
                    if (content && content.startsWith("/media/")) {
                        const remoteBlob = await downloadPackageMedia(content, checkSession);
                        return void zipFiles.push({ name: uniqueName(title, fileExtension(remoteBlob.type, content)), data: remoteBlob });
                    }
                    if (content && /^(blob:|https?:\/\/)/i.test(content)) {
                        const isExternalHttp = /^https?:\/\//i.test(content) && !content.startsWith(window.location.origin);
                        let response: Response;
                        try {
                            response = await fetch(content, isExternalHttp ? { mode: "cors", credentials: "omit" } : undefined);
                        } catch {
                            throw new Error(`无法跨域获取「${title}」引用的外部媒体，请检查资源权限或先转存至素材库`);
                        }
                        if (!response.ok) throw new Error(`无法获取「${title}」引用的媒体文件`);
                        const blob = await response.blob();
                        if (!blob.size) throw new Error(`「${title}」引用的媒体文件为空`);
                        return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, content)), data: blob });
                    }
                    zipFiles.push({ name: uniqueName(title, "json"), data: JSON.stringify(node, null, 2) });
                } finally {
                    reportNodeCollected();
                }
            }),
        );

        checkSession();
        options?.onProgress?.({ stage: "zip", completed: 0, total: zipFiles.length });
        const zip = await createZip(zipFiles, (done, zipTotal) => {
            options?.onProgress?.({ stage: "zip", completed: done, total: zipTotal });
        });
        checkSession();
        saveAs(zip, `${safeFileName(fileName)}.zip`);
    });
}

function captureExportSession() {
    const current = useAuthStore.getState();
    const owner = current.user?.id ?? null, epoch = current.sessionEpoch;
    const check = () => { if (!matchesCanvasSession(owner, epoch, useAuthStore.getState())) throw new Error("账户会话已变化，请重新导出"); };
    check();
    return check;
}

async function downloadPackageMedia(url: string, checkSession: () => void) {
    checkSession();
    const owner = useAuthStore.getState().user?.id;
    if (!owner) throw new Error('请先登录后导出媒体');
    const response = await fetch(url, { credentials: 'same-origin', headers: { 'X-Sundas-User': owner } });
    checkSession();
    if (!response.ok) throw new Error('无法读取工程引用的媒体，请检查归属或文件状态');
    const blob = await response.blob();
    checkSession();
    return blob;
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, storageKeyOrUrl: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    const match = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(storageKeyOrUrl);
    if (match) return match[1].toLowerCase();
    return storageKeyOrUrl.startsWith("image:") ? "png" : "bin";
}
