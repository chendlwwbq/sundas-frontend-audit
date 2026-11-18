import { saveAs } from "file-saver";

import { createZip, readZip } from "@/lib/zip";
import { getMediaBlob } from "@/services/file-storage";
import { getImageBlob } from "@/services/image-storage";
import { captureAccountSession } from "@/lib/account-session";
import { importMediaFiles, remapImportedMedia } from "@/lib/imported-media";
import type { Asset } from "@/stores/use-asset-store";

type AssetExportFile = {
    app: "sundas";
    version: 1;
    exportedAt: string;
    assets: Asset[];
    files: AssetExportItem[];
};

type AssetExportItem = {
    storageKey: string;
    path: string;
    mimeType: string;
    bytes: number;
};

export async function exportAssets(assets: Asset[], filename: string) {
    const session = captureAccountSession();
    const files: AssetExportItem[] = [];
    const zipFiles: { name: string; data: BlobPart }[] = [];

    await Promise.all(
        assets.map(async (asset) => {
            if (asset.kind !== "image" && asset.kind !== "video" && asset.kind !== "audio") return;
            const storageKey = asset.data.storageKey;
            if (!storageKey) return;
            const blob = asset.kind === "image" ? await getImageBlob(storageKey) : await getMediaBlob(storageKey);
            if (!blob) throw new Error("素材引用的本地文件缺失，无法完整导出；请先恢复文件后重试。");
            const path = `files/${safeFileName(storageKey)}.${fileExtension(blob.type, asset.kind)}`;
            files.push({ storageKey, path, mimeType: blob.type || asset.data.mimeType, bytes: blob.size });
            zipFiles.push({ name: path, data: blob });
        }),
    );

    const data: AssetExportFile = { app: "sundas", version: 1, exportedAt: new Date().toISOString(), assets, files };
    session.check();
    const zip = await createZip([{ name: "assets.json", data: JSON.stringify(data, null, 2) }, ...zipFiles]);
    session.check();
    saveAs(zip, filename);
}

export async function readAssetPackage(file: File) {
    const session = captureAccountSession();
    const owner = session.owner;
    if (!owner) throw new Error("请先登录");
    const zip = await readZip(file);
    session.check();
    const assetFile = zip.get("assets.json");
    if (!assetFile) throw new Error("missing assets.json");
    const data = JSON.parse(await assetFile.text()) as AssetExportFile;
    session.check();
    if (data.app !== "sundas" || data.version !== 1 || !Array.isArray(data.assets) || !Array.isArray(data.files)) throw new Error("不支持的素材文件");
    const media = await importMediaFiles(zip, data.files, owner, session.check);
    session.check();
    return remapImportedMedia(data.assets, media);
}

function safeFileName(value: string) {
    return value.replace(/[\\/:*?"<>|]/g, "_");
}

function fileExtension(mimeType: string, kind: Asset["kind"]) {
    if (mimeType.includes("png")) return "png";
    if (mimeType.includes("jpeg")) return "jpg";
    if (mimeType.includes("webp")) return "webp";
    if (mimeType.includes("gif")) return "gif";
    if (mimeType.includes("mp4")) return "mp4";
    if (mimeType.includes("webm")) return "webm";
    return kind === "image" ? "png" : "bin";
}
