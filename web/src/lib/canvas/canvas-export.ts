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

export async function exportCanvasProjects(projects: CanvasProject[], fileName = i18n.t("canvas.export.defaultProjectName")) {
    const checkSession = captureExportSession();
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const exportedProjects = await Promise.all(
        projects.map(async (project) => {
            if (project.production) parseProduction(project.production);
            const files: CanvasExportAsset[] = [];
            await Promise.all(
                collectCanvasPackageMedia(project).map(async (storageKey, index) => {
                    checkSession();
                    const blob = storageKey.startsWith('/media/') ? await downloadPackageMedia(storageKey, checkSession) : storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                    if (!blob) throw new Error("画布引用的本地素材缺失，无法完整导出；请先恢复素材后重试。");
                    const path = `projects/${project.id}/files/${index}.${fileExtension(blob.type, storageKey)}`;
                    files.push({ storageKey, path, mimeType: blob.type || "application/octet-stream", bytes: blob.size });
                    zipFiles.push({ name: path, data: blob });
                }),
            );
            return { project, files };
        }),
    );

    const data: CanvasExportFile = { app: "sundas", version: 4, exportedAt: new Date().toISOString(), projects: exportedProjects };
    checkSession();
    const zip = await createZip([{ name: "projects.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    checkSession();
    saveAs(zip, `${safeFileName(fileName)}.zip`);
}

export async function exportCanvasNodes(nodes: CanvasNodeData[], fileName = i18n.t("canvas.export.defaultNodesName")) {
    const checkSession = captureExportSession();
    const zipFiles: { name: string; data: BlobPart }[] = [];
    const used = new Set<string>();
    const uniqueName = (base: string, ext: string) => {
        const safe = safeFileName(base) || i18n.t("canvas.export.item");
        let name = `${safe}.${ext}`;
        for (let i = 1; used.has(name); i += 1) name = `${safe}-${i}.${ext}`;
        used.add(name);
        return name;
    };

    await Promise.all(
        nodes.map(async (node) => {
            const title = node.title || node.type;
            const storageKey = node.metadata?.storageKey || "";
            if (storageKey) {
                const blob = storageKey.startsWith("image:") ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
                if (blob) return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            }
            if (node.type === CanvasNodeType.Text) return void zipFiles.push({ name: uniqueName(title, "txt"), data: node.metadata?.content || node.metadata?.prompt || "" });
            const content = node.metadata?.content;
            if (content && content.startsWith("data:")) {
                const blob = await (await fetch(content)).blob();
                return void zipFiles.push({ name: uniqueName(title, fileExtension(blob.type, storageKey)), data: blob });
            }
            if (storageKey) throw new Error("节点引用的本地素材缺失，无法完整导出；请先恢复素材后重试。");
            zipFiles.push({ name: uniqueName(title, "json"), data: JSON.stringify(node, null, 2) });
        }),
    );

    checkSession();
    const zip = await createZip(zipFiles);
    checkSession();
    saveAs(zip, `${safeFileName(fileName)}.zip`);
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

function fileExtension(mimeType: string, storageKey: string) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    if (mimeType.includes("mpeg") || mimeType.includes("mp3")) return "mp3";
    if (mimeType.includes("wav")) return "wav";
    if (mimeType.includes("ogg")) return "ogg";
    return storageKey.startsWith("image:") ? "png" : "bin";
}
