type ZipFile = {
    name: string;
    data: BlobPart;
};

// fflate 只在导入/导出压缩包时才用到，改成按需加载，首屏不必为它买单。
const loadFflate = () => import("fflate");

export async function createZip(files: ZipFile[]) {
    const { zipSync } = await loadFflate();
    const entries = await Promise.all(
        files.map(async (file) => {
            const data = new Uint8Array(await new Blob([file.data]).arrayBuffer());
            return [file.name, data] as const;
        }),
    );
    return new Blob([zipSync(Object.fromEntries(entries), { level: 0 })], { type: "application/zip" });
}

export async function readZip(file: Blob) {
    const { unzipSync } = await loadFflate();
    const entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
    return new Map(Object.entries(entries).map(([name, data]) => [name, new Blob([data])]));
}
