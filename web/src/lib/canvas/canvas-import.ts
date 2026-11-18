import { readZip } from "@/lib/zip";
import { importMediaFiles } from "@/lib/imported-media";
import { collectCanvasPackageMedia, remapCanvasPackageIdentities, remapCanvasPackageMedia } from './canvas-package';
import { parseProduction } from '../../../../shared/production';
import { currentMediaOwner } from "@/services/cloud-media";
import { captureAccountSession } from "@/lib/account-session";
import type { CanvasExportFile } from "@/types/canvas-export";

export async function readCanvasPackage(file: Blob) {
    const session = captureAccountSession();
    const owner = session.owner;
    if (!owner) throw new Error("请先登录");
    const zip = await readZip(file);
    session.check();
    const projectFile = zip.get("projects.json");
    if (!projectFile) throw new Error("missing projects.json");
    const data = JSON.parse(await projectFile.text()) as CanvasExportFile;
    session.check();
    if (data.app !== "sundas" || ![3, 4].includes(data.version) || !Array.isArray(data.projects)) throw new Error("不支持的画布文件");
    for (const item of data.projects) {
        if (!item?.project || !Array.isArray(item.files) || !Array.isArray(item.project.nodes) || !Array.isArray(item.project.connections)) throw new Error('工程结构不完整');
        const ids = new Set(item.project.nodes.map(node => node.id));
        if (ids.size !== item.project.nodes.length || item.project.nodes.some(node => typeof node.id !== 'string' || !node.id) || item.project.connections.some(edge => !ids.has(edge.fromNodeId) || !ids.has(edge.toNodeId))) throw new Error('工程节点或连线身份无效');
        if (item.project.production) parseProduction(item.project.production);
        if (item.project.production?.shots.some(shot => shot.nodeId && !ids.has(shot.nodeId))) throw new Error('制作镜头绑定的节点缺失');
        if (item.files.some(file => typeof file.storageKey !== 'string' || typeof file.path !== 'string' || typeof file.mimeType !== 'string' || !zip.has(file.path))) throw new Error('工程素材清单或文件不完整');
        const files = new Set(item.files.map(file => file.storageKey));
        if (collectCanvasPackageMedia(item.project).some(key => !files.has(key))) throw new Error('工程备份缺少引用素材，请重新完整导出');
    }
    const media = await importMediaFiles(zip, data.projects.flatMap((project) => project.files), owner, session.check);
    const projects = data.projects.map((item) => remapCanvasPackageIdentities(remapCanvasPackageMedia(item.project, media), () => crypto.randomUUID()));
    session.check();
    if (currentMediaOwner() !== owner) throw new Error("登录账户已变化，请重新导入");
    return projects;
}
