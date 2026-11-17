import { cloudSaveStatus, hasLocalMedia } from "@/lib/cloud-sync-status";
import { useCloudSyncStatus } from "@/stores/use-cloud-sync-status";
import { readAllAssetPages, type AssetPage } from "@/lib/asset-pagination";
import * as React from "react";
import { notification } from "antd";
import deepEqual from "fast-deep-equal";

import { localForageStorage } from "@/lib/localforage-storage";
import { createSerializedWriter } from "@/lib/serialized-writer";
import { decideProjectMerge, type ProjectSyncBaseline } from "@/lib/canvas/project-sync-merge";
import { apiRequest, ApiError, type ApiRequestInit } from "@/services/api/client";
import { flushAssetAccount, useAssetStore, type Asset } from "@/stores/use-asset-store";
import { useAuthStore } from "@/stores/use-auth-store";
import { flushCanvasAccount, useCanvasStore, type CanvasProject } from "@/stores/canvas/use-canvas-store";

type CloudProject = { id: string; title?: string; content: CanvasProject | null; updatedAt: string; version: number };
export type ToolCloudProject = { id: string; title: string; content: CanvasProject; updatedAt: string; version: number };
type CloudAsset = { id: string; content: Asset | null; version: number };

const projectTimes = new Map<string, string>();
const projectVersions = new Map<string, number>();
const projectBaselines = new Map<string, ProjectSyncBaseline>();
const baselineWrites = createSerializedWriter();
// 云端快照读取与本地上传共用队列，防止旧快照覆盖刚写回的版本基准。
const cloudOperations = createSerializedWriter();
const projectConflicts = new Set<string>();
const projectConflictVersions = new Map<string, number | undefined>();
const assetTimes = new Map<string, string>();
const assetBaselines = new Map<string, ProjectSyncBaseline>();
const assetConflicts = new Set<string>();
let projectBaselineDirty = false;
let assetBaselineDirty = false;
class BaselineStorageError extends Error {}
let knownProjects = new Set<string>();
let applying = false;
let syncing = false;
let pending = false;
let timer: number | null = null;
let snapshotReady = false;
let syncEpoch = 0;
let syncSession: number;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let currentSyncEntry: (() => Promise<void>) | undefined;
let syncRequests: { owner: string; controller: AbortController } | undefined;
let readingCloud = false;
let snapshotError = '';
const saveErrors = new Map<string,string>();

export function retryCloudSync() { return currentSyncEntry?.() ?? Promise.resolve(); }

function publishSyncStatus() {
    const auth = useAuthStore.getState();
    if (!auth.user || !auth.ready || syncSession !== auth.sessionEpoch) return;
    const projects = useCanvasStore.getState().projects;
    const assets = useAssetStore.getState().assets;
    const error = snapshotError || (projectBaselineDirty || assetBaselineDirty ? '本地同步记录保存失败' : '') || [...saveErrors.values()][0] || '';
    const stateOf = (dirty: boolean, conflict: boolean, localMedia: boolean, failed: boolean) => cloudSaveStatus({ready:snapshotReady,reading:readingCloud,saving:syncing || pending,dirty,conflict,error:failed,localMedia});
    const projectStates = Object.fromEntries(projects.map(project => [project.id, stateOf(
        projectTimes.get(project.id)!==project.updatedAt || projectBaselineDirty,
        projectConflicts.has(project.id), hasLocalMedia(project), !!snapshotError || projectBaselineDirty || saveErrors.has(`画布:${project.id}`))]));
    useCloudSyncStatus.setState({owner:auth.user.id,session:auth.sessionEpoch,projects:projectStates,error,
        status:stateOf(projectBaselineDirty || assetBaselineDirty || projects.some(p=>projectTimes.get(p.id)!==p.updatedAt) || assets.some(a=>assetTimes.get(a.id)!==a.updatedAt) || !!useCanvasStore.getState().deletedProjects.length || !!useAssetStore.getState().deletedAssets.length,
            !!projectConflicts.size || !!assetConflicts.size,projects.some(hasLocalMedia)||assets.some(hasLocalMedia),!!error)});
}

function retryAction() {
    const owner=useAuthStore.getState().user?.id,epoch=syncEpoch,session=useAuthStore.getState().sessionEpoch;
    return React.createElement('button',{type:'button',className:'text-sm underline',onClick:()=>{if(owner && isCurrentSession(owner,epoch,session)) void retryCloudSync();}},'重新同步');
}

function syncRequest<T = unknown>(owner: string, path: string, init: ApiRequestInit = {}) {
    return apiRequest<T>(path, { ...init, signal: init.signal ?? (syncRequests?.owner===owner ? syncRequests.controller.signal : undefined), headers: { ...init.headers, "X-Sundas-User": owner } });
}

function isCurrentSession(owner: string, epoch: number, session: number) {
    const auth = useAuthStore.getState();
    return syncEpoch === epoch && auth.sessionEpoch === session && auth.ready && auth.user?.id === owner;
}

async function saveBaselines(owner: string, epoch: number, session: number) {
    const snapshot = JSON.stringify(Object.fromEntries(projectBaselines));
    try {
        // 文档和基准不能逆序落盘，否则刷新可能把旧缓存当成新编辑回传。
        await flushCanvasAccount();
        if (!isCurrentSession(owner, epoch, session)) return;
        await baselineWrites.write(() => localForageStorage.setItem(`sundas:canvas_sync:${owner}`, snapshot));
        if (isCurrentSession(owner, epoch, session)) {
            projectBaselineDirty = false;
            if (!assetBaselineDirty) notification.destroy?.("sync-baseline-error");
        }
    } catch {
        if (isCurrentSession(owner, epoch, session)) { projectBaselineDirty = true; reportBaselineError(); }
        throw new BaselineStorageError();
    }
}

async function saveAssetBaselines(owner: string, epoch: number, session: number) {
    const snapshot = JSON.stringify(Object.fromEntries(assetBaselines));
    try {
        await flushAssetAccount();
        if (!isCurrentSession(owner,epoch,session)) return;
        await baselineWrites.write(() => localForageStorage.setItem(`sundas:asset_sync:${owner}`, snapshot));
        if (isCurrentSession(owner, epoch, session)) {
            assetBaselineDirty = false;
            if (!projectBaselineDirty) notification.destroy?.("sync-baseline-error");
        }
    } catch {
        if (isCurrentSession(owner, epoch, session)) { assetBaselineDirty = true; reportBaselineError(); }
        throw new BaselineStorageError();
    }
}

function reportBaselineError() {
    publishSyncStatus();
    notification.error({ message: "本地同步记录保存失败", description: "请检查浏览器存储空间，并刷新或重新连接后重试；切换设备时可能需要处理同步冲突。", duration: 0, key: "sync-baseline-error", actions: retryAction() });
}

function withValidId<T extends { id: string; updatedAt: string }>(item: T): T {
    if (UUID_RE.test(item.id)) return item;
    return { ...item, id: crypto.randomUUID(), updatedAt: new Date().toISOString() };
}

/**
 * 云端内容按 JSONB 保存，值为 `undefined` 的字段会被丢掉；导演台场景和节点元数据里
 * 大量存在这类字段，直接用对象深比较会把「同一份文档」判成「云端已变化」。
 * 比较前两边都过一遍 JSON，和云端存储格式对齐。
 */
function sameContent(a: unknown, b: unknown) {
    return deepEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null)));
}

function clearProjectConflict(id: string) {
    projectConflicts.delete(id);
    publishSyncStatus();
    projectConflictVersions.delete(id);
    notification.destroy?.(`canvas-conflict-${id}`);
}

function reportConflict(id: string, version = projectVersions.get(id), note?: string) {
    if (projectConflicts.has(id) && projectConflictVersions.get(id) === version && !note) return;
    projectConflicts.add(id);
    publishSyncStatus();
    projectConflictVersions.set(id, version);
    const project = useCanvasStore.getState().projects.find((item) => item.id === id);
    const detail = project ? `“${project.title}”的本地与云端内容不同。保留本地：将本机内容保存到云端；使用云端：用云端内容替换本机画布。选择前，两份内容均保留。` : "本地删除记录已保留，云端画布发生变化，请先核对后再处理。";
    const owner=useAuthStore.getState().user?.id, epoch=syncEpoch, session=useAuthStore.getState().sessionEpoch;
    const deleting=!project && useCanvasStore.getState().deletedProjects.some(item=>item.id===id);
    const actions=deleting && owner ? React.createElement('div',{className:'flex gap-3'},
        React.createElement('button',{type:'button',className:'text-sm underline',onClick:()=>void resolveDeletedProject(id,'restore',owner,epoch,session)},'恢复云端画布'),
        React.createElement('button',{type:'button',className:'text-sm text-red-500 underline',onClick:()=>void resolveDeletedProject(id,'delete',owner,epoch,session)},'确认删除云端')) : project && owner ? React.createElement('div', { className: 'flex flex-wrap gap-4' },
        React.createElement('button', { type: 'button', className: 'text-sm underline', onClick: () => void resolveProjectConflict(id, 'local', version, owner, epoch, session) }, '保留本地'),
        React.createElement('button', { type: 'button', className: 'text-sm underline', onClick: () => void resolveProjectConflict(id, 'cloud', version, owner, epoch, session) }, '使用云端')) : undefined;
    notification.error({ message: "画布同步冲突", description: `${note ? `${note} ` : ''}${detail} 画布 ID：${id}`, actions, closable: !project, duration: 0, key: `canvas-conflict-${id}` });
}

async function acknowledgeProject(project: CanvasProject, version: number, owner: string, epoch: number, session: number) {
    saveErrors.delete(`画布:${project.id}`);
    projectTimes.set(project.id, project.updatedAt);
    projectVersions.set(project.id, version);
    projectBaselines.set(project.id, { version, updatedAt: project.updatedAt });
    await saveBaselines(owner, epoch, session);
    if (isCurrentSession(owner, epoch, session)) {
        clearProjectConflict(project.id);
        notification.destroy?.(`sync-error-画布-${project.id}`);
    }
}

// 保存回执可能在服务端提交后丢失；只核对原提交，不把随后编辑误当作失败的提交。
async function reconcileProjectSave(project: CanvasProject, error: unknown, owner: string, epoch: number, session: number) {
    if (error instanceof BaselineStorageError) return;
    const conflict = error instanceof ApiError && error.errorCode === 'PROJECT_CONFLICT';
    if (conflict || !(error instanceof ApiError) || error.status >= 500) {
        try {
            const { project: remote } = await syncRequest<{ project: CloudProject }>(owner, `/api/canvas/projects/${project.id}`);
            if (!isCurrentSession(owner, epoch, session)) return;
            if (remote.id === project.id && remote.content && sameContent(project, { ...remote.content, id: project.id })) {
                await acknowledgeProject(project, remote.version, owner, epoch, session);
                return;
            }
            if (conflict) { reportConflict(project.id, remote.version, '云端有不同的内容，请选择保留哪一份。'); return; }
        } catch (readError) {
            if (!isCurrentSession(owner, epoch, session) || readError instanceof BaselineStorageError) return;
        }
    }
    if (conflict) reportConflict(project.id);
    else reportSyncError('画布', project.id, error);
}

function resolveProjectConflict(id: string, choice: 'local' | 'cloud', version: number | undefined, owner: string, epoch: number, session: number) {
    const visible = useCanvasStore.getState().projects.find(project => project.id === id);
    const expected = visible ? structuredClone(visible) : null;
    return cloudOperations.write(async () => {
        const active = () => isCurrentSession(owner, epoch, session);
        const unchanged = () => expected && deepEqual(useCanvasStore.getState().projects.find(project => project.id === id), expected) && !useCanvasStore.getState().deletedProjects.some(project => project.id === id);
        if (!active() || !projectConflicts.has(id) || !expected) return;
        if (!unchanged()) { reportConflict(id, version, '本地画布已有新修改，请重新选择。'); return; }
        try {
            const { project: remote } = await syncRequest<{ project: CloudProject }>(owner, `/api/canvas/projects/${id}`);
            if (!active()) return;
            if (!unchanged()) { reportConflict(id, remote.version, '核对期间本地画布已有新修改，请重新选择。'); return; }
            if (remote.version !== version) { reportConflict(id, remote.version, '云端刚刚又有更新，请重新选择。'); return; }
            if (remote.id !== id || !remote.content || (remote.content.id && remote.content.id !== id)) {
                reportConflict(id, remote.version, '云端画布内容不可读取，本地内容已保留。'); return;
            }
            if (choice === 'local') {
                try {
                    const result = await syncRequest<{ project: { version: number } }>(owner, `/api/canvas/projects/${id}`, {
                        method: 'PUT', json: { id, title: expected.title, content: expected, version: remote.version, directorSequenceVersion: 1 },
                    });
                    if (!active()) return;
                    await acknowledgeProject(expected, result.project.version, owner, epoch, session);
                } catch (error) {
                    if (active()) await reconcileProjectSave(expected, error, owner, epoch, session);
                }
                // 请求途中继续编辑的内容仍留在本地，下一次按新的云端基准保存。
                if (active()) scheduleSync();
            } else {
                const project = { ...remote.content, id, title: remote.title ?? remote.content.title, updatedAt: remote.content.updatedAt || remote.updatedAt };
                applying = true;
                try {
                    const store = useCanvasStore.getState();
                    store.replaceProjects(store.projects.map(item => item.id === id ? project : item), store.deletedProjects);
                    window.dispatchEvent(new CustomEvent('sundas:canvas-conflict-resolved', { detail: { projectId: id, owner, sessionEpoch: session } }));
                } finally { applying = false; }
                await acknowledgeProject(project, remote.version, owner, epoch, session);
            }
        } catch (error) {
            if (!active()) return;
            if (error instanceof BaselineStorageError) {
                reportConflict(id, version, '云端内容已显示，但本地保存尚未完成，请检查浏览器存储后重试。'); return;
            }
            reportConflict(id, version, error instanceof ApiError && error.status === 404 ? '云端画布已不存在，本地内容已保留，请先导出备份。' : '暂时无法读取云端，本地内容已保留，请重试。');
        }
    });
}

function resolveDeletedProject(id:string,action:'restore'|'delete',owner:string,epoch:number,session:number) {
    return cloudOperations.write(async()=>{
        const active=()=>isCurrentSession(owner,epoch,session);
        if(!active() || !useCanvasStore.getState().deletedProjects.some(item=>item.id===id) || useCanvasStore.getState().projects.some(item=>item.id===id))return;
        try {
            let remote:CloudProject|null=null;
            try {remote=(await syncRequest<{project:CloudProject}>(owner,`/api/canvas/projects/${id}`)).project;}
            catch(error){if(!(error instanceof ApiError && error.status===404))throw error;}
            if(!active())return;
            if(action==='restore' && remote && !remote.content)throw new Error('云端画布内容不可读取，删除记录已保留');
            if(action==='delete' && remote)await syncRequest(owner,`/api/canvas/projects/${id}?version=${remote.version}`,{method:'DELETE'});
            if(!active())return;
            applying=true;
            try {
                useCanvasStore.getState().clearDeletedProjects([id]);
                if(action==='restore' && remote?.content) {
                    const project={...remote.content,id};
                    useCanvasStore.getState().replaceProjects([...useCanvasStore.getState().projects,project],useCanvasStore.getState().deletedProjects);
                    const updatedAt=project.updatedAt||remote.updatedAt;
                    projectBaselines.set(id,{version:remote.version,updatedAt});projectVersions.set(id,remote.version);projectTimes.set(id,updatedAt);knownProjects.add(id);
                } else {projectBaselines.delete(id);projectVersions.delete(id);projectTimes.delete(id);knownProjects.delete(id);}
                clearProjectConflict(id);
            }finally{applying=false;}
            await saveBaselines(owner,epoch,session);
        }catch(error){if(active() && !(error instanceof BaselineStorageError))reportSyncError('画布',id,error);}
    });
}

function reportSyncError(kind: "画布" | "素材", id: string, error: unknown) {
    saveErrors.set(`${kind}:${id}`, error instanceof Error ? error.message || '同步失败' : "同步失败");
    publishSyncStatus();
    const description = error instanceof ApiError ? error.message : "网络或服务暂不可用，请检查后重试。";
    notification.error({ message: `${kind}未同步到云端`, description: `${description} 当前页面内容保留，请重新同步。`, actions:retryAction(), duration: 0, key: `sync-error-${kind}-${id}` });
}

function reportAssetConflict(id: string) {
    if (assetConflicts.has(id)) return;
    assetConflicts.add(id);
    publishSyncStatus();
    const asset = useAssetStore.getState().assets.find((item) => item.id === id);
    const detail = asset ? `“${asset.title}”的本地修改已保留，请检查云端内容。` : "本地删除记录已保留，云端素材发生变化，请先核对后再处理。";
    notification.error({ message: "素材同步冲突", description: `${detail} 素材 ID：${id}`, duration: 0, key: `asset-conflict-${id}` });
}

function mergeProjects(cloud: CloudProject[]) {
    const resolved: string[] = [];
    const deletedProjects = useCanvasStore.getState().deletedProjects;
    const deletedIds = new Set(deletedProjects.map((item) => item.id));
    const local = useCanvasStore.getState().projects.map(withValidId).filter((project) => !deletedIds.has(project.id));
    const remoteById = new Map(cloud.map((item) => [item.id, item]));
    projectVersions.clear();
    for (const remote of cloud) projectVersions.set(remote.id, remote.version);
    for (const id of deletedIds) {
        const remote = remoteById.get(id);
        const baseline = projectBaselines.get(id);
        if (remote && (!baseline || baseline.version !== remote.version)) reportConflict(id);
    }
    const merged = local.flatMap((project) => {
        const remote = remoteById.get(project.id);
        const remoteState = remote?.content ? { version: remote.version, updatedAt: remote.content.updatedAt || remote.updatedAt } : null;
        const equal = Boolean(remote?.content && sameContent(project, { ...remote.content, id: project.id }));
        const decision = decideProjectMerge(project.updatedAt, remoteState, projectBaselines.get(project.id), equal);
        if (projectConflicts.has(project.id) && !equal) { reportConflict(project.id); return [project]; }
        if (remote && !remote.content) { reportConflict(project.id); return [project]; }
        if (decision === "conflict") { reportConflict(project.id); return [project]; }
        if (decision === "deleted") { projectBaselines.delete(project.id); return []; }
        if (remote && remoteState && (decision === "same" || decision === "remote")) {
            saveErrors.delete(`画布:${project.id}`);
            projectBaselines.set(project.id, remoteState);
            projectTimes.set(project.id, remoteState.updatedAt);
            if (equal) resolved.push(project.id);
            if (decision === "remote") return [{ ...remote.content!, id: project.id }];
        }
        return [project];
    });
    const seen = new Set(merged.map((project) => project.id));
    for (const remote of cloud) {
        if (!seen.has(remote.id) && !deletedIds.has(remote.id) && remote.content) {
            merged.push({ ...remote.content, id: remote.id });
            projectTimes.set(remote.id, remote.content.updatedAt);
            projectBaselines.set(remote.id, { version: remote.version, updatedAt: remote.content.updatedAt });
        }
    }
    useCanvasStore.getState().replaceProjects(merged, deletedProjects);
    knownProjects = new Set(merged.map((project) => project.id));
    return resolved;
}

function mergeAssets(cloud: CloudAsset[], confirmedDeleted = new Set<string>()) {
    const deleted = new Set(useAssetStore.getState().deletedAssets ?? []);
    const local = useAssetStore.getState().assets.map(withValidId).filter((asset) => {
        if (deleted.has(asset.id)) return false;
        if (!confirmedDeleted.has(asset.id)) return true;
        if (assetBaselines.get(asset.id)?.updatedAt !== asset.updatedAt) return true;
        assetBaselines.delete(asset.id);
        assetTimes.delete(asset.id);
        return false;
    });
    const remoteById = new Map(cloud.map((item) => [item.id, item]));
    for (const id of deleted) {
        const remote = remoteById.get(id);
        if (remote && assetBaselines.get(id)?.version !== remote.version) reportAssetConflict(id);
    }
    const merged = local.map((asset) => {
        const remote = remoteById.get(asset.id);
        if (!remote?.content) {
            if (assetBaselines.has(asset.id)) reportAssetConflict(asset.id);
            return asset;
        }
        const remoteState = {version: remote.version, updatedAt: remote.content.updatedAt};
        const decision = decideProjectMerge(asset.updatedAt, remoteState, assetBaselines.get(asset.id), sameContent(asset, { ...remote.content, id: asset.id }));
        if (decision === "conflict") reportAssetConflict(asset.id);
        if (decision === "same" || decision === "remote") {
            assetConflicts.delete(asset.id);
            notification.destroy(`asset-conflict-${asset.id}`);
            assetBaselines.set(asset.id, remoteState);
            assetTimes.set(asset.id, remoteState.updatedAt);
            saveErrors.delete(`素材:${asset.id}`);
            if (decision === "remote") return { ...remote.content, id: asset.id };
        }
        return asset;
    });
    const seen = new Set(merged.map((asset) => asset.id));
    for (const id of confirmedDeleted) if (!seen.has(id)) { assetBaselines.delete(id); assetTimes.delete(id); }
    for (const remote of cloud) {
        if (!seen.has(remote.id) && !deleted.has(remote.id) && remote.content) {
            merged.push({ ...remote.content, id: remote.id });
            assetBaselines.set(remote.id, {version: remote.version, updatedAt: remote.content.updatedAt});
            assetTimes.set(remote.id, remote.content.updatedAt);
        }
    }
    useAssetStore.getState().replaceAssets(merged);
}

function syncAll() {
    return cloudOperations.write(syncAllNow);
}

/** A server-side tool must operate on the exact document shown to the user. */
export function prepareCanvasForTools(projectId: string): Promise<ToolCloudProject> {
    const auth = useAuthStore.getState();
    const owner = auth.user?.id, epoch = syncEpoch, session = auth.sessionEpoch;
    const visible = useCanvasStore.getState().projects.find(project => project.id === projectId);
    const expected = visible ? structuredClone(visible) : null;
    return cloudOperations.write(async () => {
        if (!owner || !snapshotReady || !isCurrentSession(owner, epoch, session)) throw new Error("画布同步尚未就绪，请稍后重试");
        const unchanged = () => expected && deepEqual(useCanvasStore.getState().projects.find(project => project.id === projectId), expected) && !useCanvasStore.getState().deletedProjects.some(project => project.id === projectId);
        if (!unchanged()) throw new Error("等待期间画布已变化，请重新操作");
        if (projectConflicts.has(projectId)) throw new Error("请先处理当前画布的同步冲突");
        await syncAllNow();
        if (!isCurrentSession(owner, epoch, session) || !unchanged()) throw new Error("保存期间画布或账户已变化，请重新操作");
        const local = useCanvasStore.getState().projects.find(project => project.id === projectId);
        if (!local || projectTimes.get(projectId) !== local.updatedAt || projectConflicts.has(projectId)) throw new Error("当前画布尚未同步成功，请检查网络或同步提示");
        const { project } = await syncRequest<{ project: ToolCloudProject }>(owner, `/api/canvas/projects/${projectId}`);
        if (!isCurrentSession(owner, epoch, session) || !unchanged()) throw new Error("画布或账户已变化，请重新操作");
        if (project.id !== projectId || project.title !== local.title || project.version !== projectVersions.get(projectId) || !sameContent(project.content, expected)) throw new Error("云端画布已变化，请先重新同步");
        return project;
    });
}

/** Accept a tool receipt only while the local document still matches its base. */
export function acceptCanvasToolProject(remote: ToolCloudProject, expectedUpdatedAt: string): Promise<CanvasProject> {
    const auth = useAuthStore.getState();
    const owner = auth.user?.id, epoch = syncEpoch, session = auth.sessionEpoch;
    const visible = useCanvasStore.getState().projects.find(project => project.id === remote.id);
    const expected = visible ? structuredClone(visible) : null;
    return cloudOperations.write(async () => {
        if (!owner || !isCurrentSession(owner, epoch, session)) throw new Error("登录账户已变化");
        const store = useCanvasStore.getState();
        const local = store.projects.find(project => project.id === remote.id);
        if (!local || local.updatedAt !== expectedUpdatedAt || !deepEqual(local, expected) || store.deletedProjects.some(project => project.id === remote.id)) throw new Error("执行期间画布已有新修改，助手结果已保留在服务端，请处理同步冲突后继续");
        if (remote.version < (projectVersions.get(remote.id) || 0)) throw new Error("助手返回的画布版本已过期");
        if (!remote.content || (remote.content.id && remote.content.id !== remote.id) || (local.production && !remote.content.production)) throw new Error("工具返回的画布身份或制作文档不完整，原稿已保留");
        // Wait before publishing either the document or its baseline. No asynchronous gap may
        // expose a new baseline while the editor still owns its preceding document.
        await baselineWrites.flush();
        if (!isCurrentSession(owner, epoch, session)) throw new Error("登录账户已变化");
        const latest = useCanvasStore.getState();
        if (!deepEqual(latest.projects.find(project => project.id === remote.id), expected) || latest.deletedProjects.some(project => project.id === remote.id)) throw new Error("等待期间画布已有新修改，工具结果已保留在服务端");
        const project = { ...remote.content, id: remote.id, title: remote.title, updatedAt: remote.content.updatedAt || new Date(remote.updatedAt).toISOString() };
        if (remote.version === projectVersions.get(remote.id) && !sameContent(project, local)) throw new Error("同一云端版本的画布内容不一致，请先核对同步状态");
        projectTimes.set(remote.id, project.updatedAt);
        projectVersions.set(remote.id, remote.version);
        projectBaselines.set(remote.id, { version: remote.version, updatedAt: project.updatedAt });
        knownProjects.add(remote.id);
        clearProjectConflict(remote.id);
        applying = true;
        try { latest.replaceProjects(latest.projects.map(item => item.id === remote.id ? project : item), latest.deletedProjects); }
        finally { applying = false; }
        projectBaselineDirty = true;
        scheduleSync();
        return project;
    });
}

async function syncAllNow() {
    const owner = useAuthStore.getState().user?.id;
    const epoch = syncEpoch;
    const session = useAuthStore.getState().sessionEpoch;
    if (!owner || !useAuthStore.getState().ready || !snapshotReady || session !== syncSession) return;
    const active = () => isCurrentSession(owner, epoch, session);
    if (syncing) {
        pending = true;
        return;
    }
    syncing = true;
    publishSyncStatus();
    try {
        if (projectBaselineDirty) await saveBaselines(owner, epoch, session).catch(() => undefined);
        if (!active()) return;
        if (assetBaselineDirty) await saveAssetBaselines(owner, epoch, session).catch(() => undefined);
        if (!active()) return;
        const projects = useCanvasStore.getState().projects;
        const projectIds = new Set(projects.map((project) => project.id));
        const deletedProjects = useCanvasStore.getState().deletedProjects;
        const deletedIds = new Set(deletedProjects.map((item) => item.id));
        const cleared: string[] = [];
        for (const item of deletedProjects) {
            if (!active()) return;
            if (projectConflicts.has(item.id)) continue;
            const version = projectVersions.get(item.id);
            if (version === undefined) {
                projectBaselines.delete(item.id);
                try { await saveBaselines(owner, epoch, session); cleared.push(item.id); } catch { /* 保留删除记录，待本地存储恢复后重试。 */ }
                continue;
            }
            try {
                await syncRequest(owner, `/api/canvas/projects/${item.id}?version=${version}`, { method: "DELETE" });
                if (!active()) return;
                cleared.push(item.id);
                saveErrors.delete(`画布:${item.id}`);
                projectVersions.delete(item.id);
                projectBaselines.delete(item.id);
                await saveBaselines(owner, epoch, session);
            } catch (error) {
                if (!active()) return;
                if (error instanceof ApiError && error.errorCode === "PROJECT_CONFLICT") reportConflict(item.id);
                else if (!(error instanceof BaselineStorageError)) reportSyncError("画布", item.id, error);
                // 删除失败时保留 tombstone，下次同步继续重试。
            }
        }
        if (!active()) return;
        if (cleared.length) useCanvasStore.getState().clearDeletedProjects(cleared);
        for (const id of knownProjects) {
            if (!active()) return;
            const version = projectVersions.get(id);
            if (!projectIds.has(id) && !deletedIds.has(id) && version !== undefined && !projectConflicts.has(id)) {
                await syncRequest(owner, `/api/canvas/projects/${id}?version=${version}`, { method: "DELETE" }).catch((error) => {
                    if (!active()) return;
                    if (error instanceof ApiError && error.errorCode === "PROJECT_CONFLICT") reportConflict(id);
                    else reportSyncError("画布", id, error);
                });
            }
        }
        if (!active()) return;
        knownProjects = projectIds;

        for (const project of projects) {
            if (!active()) return;
            if (projectConflicts.has(project.id)) continue;
            if (projectTimes.get(project.id) === project.updatedAt) continue;
            try {
                const version = projectVersions.get(project.id);
                const result = await syncRequest<{ project: { version: number } }>(owner, version === undefined ? "/api/canvas/projects" : `/api/canvas/projects/${project.id}`, {
                    method: version === undefined ? "POST" : "PUT",
                    json: { id: project.id, title: project.title, content: project, version, directorSequenceVersion: 1 },
                });
                if (active()) {
                    await acknowledgeProject(project, result.project.version, owner, epoch, session);
                }
            } catch (error) {
                if (!active()) return;
                await reconcileProjectSave(project, error, owner, epoch, session);
                // 下次变动或下次登录时重试。
            }
        }

        const assets = useAssetStore.getState().assets;
        if (!active()) return;
        const deletedAssets = useAssetStore.getState().deletedAssets ?? [];
        const deletedAssetIds = new Set(deletedAssets);
        for (const id of deletedAssets) {
            if (!active()) return;
            if (assetConflicts.has(id)) continue;
            try {
                await syncRequest(owner, `/api/assets/${id}?version=${assetBaselines.get(id)?.version ?? 0}`, { method: "DELETE" });
                if (active()) {
                    useAssetStore.getState().clearDeletedAssets([id]);
                    saveErrors.delete(`素材:${id}`);
                    assetTimes.delete(id);
                    assetBaselines.delete(id);
                    await saveAssetBaselines(owner, epoch, session);
                    if (active()) notification.destroy(`sync-error-素材-${id}`);
                }
            } catch (error) {
                if (active()) {
                    if (error instanceof ApiError && error.errorCode === "ASSET_CONFLICT") reportAssetConflict(id);
                    else if (!(error instanceof BaselineStorageError)) reportSyncError("素材", id, error);
                }
            }
        }
        if (!active()) return;

        for (const asset of assets) {
            if (!active()) return;
            if (deletedAssetIds.has(asset.id)) continue;
            if (assetConflicts.has(asset.id)) continue;
            if (assetTimes.get(asset.id) === asset.updatedAt) continue;
            try {
                const result = await syncRequest<{ asset: { version: number } }>(owner, "/api/assets", {
                    method: "POST",
                    json: { id: asset.id, kind: asset.kind, title: asset.title, content: asset, version: assetBaselines.get(asset.id)?.version },
                });
                if (active()) {
                    saveErrors.delete(`素材:${asset.id}`);
                    assetTimes.set(asset.id, asset.updatedAt);
                    assetBaselines.set(asset.id, {version: result.asset.version, updatedAt: asset.updatedAt});
                    await saveAssetBaselines(owner, epoch, session);
                    if (active()) notification.destroy(`sync-error-素材-${asset.id}`);
                }
            } catch (error) {
                if (active()) {
                    if (error instanceof ApiError && error.errorCode === "ASSET_CONFLICT") reportAssetConflict(asset.id);
                    else if (!(error instanceof BaselineStorageError)) reportSyncError("素材", asset.id, error);
                }
                // 下次变动或下次登录时重试。
            }
        }
    } finally {
        syncing = false;
        if (active()) publishSyncStatus();
        if (pending) {
            pending = false;
            void syncAll();
        }
    }
}

function scheduleSync() {
    publishSyncStatus();
    if (applying) return;
    if (timer) window.clearTimeout(timer);
    timer = window.setTimeout(() => {
        timer = null;
        void retryCloudSync();
    }, 1500);
}

export function useCloudSync() {
    const ready = useAuthStore((state) => state.ready);
    const userId = useAuthStore((state) => state.user?.id);
    const session = useAuthStore((state) => state.sessionEpoch);
    const canvasHydrated = useCanvasStore((state) => state.hydrated);
    const assetHydrated = useAssetStore((state) => state.hydrated);

    React.useEffect(() => {
        if (!ready || !userId || !canvasHydrated || !assetHydrated) return;
        const epoch = ++syncEpoch;
        syncSession = session;
        const controller = new AbortController();
        syncRequests = { owner:userId,controller };
        snapshotError = '';
        saveErrors.clear();
        readingCloud = false;
        useCloudSyncStatus.setState({owner:userId,session,projects:{},status:'reading',error:''});
        let cancelled = false;
        let loadingSnapshot = false;
        let retryAfterSnapshot = false;
        let refreshRequested = false;
        snapshotReady = false;
        applying = false;
        knownProjects = new Set();
        projectTimes.clear();
        projectVersions.clear();
        projectBaselines.clear();
        for (const id of projectConflicts) clearProjectConflict(id);
        assetTimes.clear();
        assetBaselines.clear();
        assetConflicts.clear();
        projectBaselineDirty = false;
        assetBaselineDirty = false;

        const unsubscribeCanvas = useCanvasStore.subscribe((state, previous) => {
            if (state.projects !== previous.projects || state.deletedProjects !== previous.deletedProjects) scheduleSync();
        });
        const unsubscribeAssets = useAssetStore.subscribe((state, previous) => {
            if (state.assets !== previous.assets || state.deletedAssets !== previous.deletedAssets) scheduleSync();
        });

        const loadSnapshot = async () => {
            if (cancelled || !isCurrentSession(userId, epoch, session)) return;
            if (loadingSnapshot) { refreshRequested = true; return; }
            loadingSnapshot = true;
            readingCloud = true;
            snapshotError = '';
            publishSyncStatus();
            await cloudOperations.write(async () => {
            try {
                if (cancelled || !isCurrentSession(userId, epoch, session)) return;
                await baselineWrites.flush();
                const [projectResult, assetResult, saved, savedAssets] = await Promise.all([
                    syncRequest<{ projects: CloudProject[] }>(userId, "/api/canvas/projects"),
                    readAllAssetPages<CloudAsset>(cursor => syncRequest<AssetPage<CloudAsset>>(userId, `/api/assets${cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''}`), () => !cancelled && isCurrentSession(userId, epoch, session)),
                    localForageStorage.getItem(`sundas:canvas_sync:${userId}`),
                    localForageStorage.getItem(`sundas:asset_sync:${userId}`),
                ]);
                if (cancelled || !isCurrentSession(userId, epoch, session)) return;
                // Traversal is not a strict database snapshot. Resolve absences
                // before publishing any collection or changing a sync baseline.
                const remoteAssets = new Map(assetResult.map(asset => [asset.id, asset]));
                const baselineIds = new Set(assetBaselines.keys());
                if (savedAssets && !snapshotReady) {
                    try { for (const id of Object.keys(JSON.parse(savedAssets))) if (UUID_RE.test(id)) baselineIds.add(id); }
                    catch { /* Damaged cached baselines cannot prove a deletion. */ }
                }
                const confirmedDeleted = new Set<string>();
                for (const id of baselineIds) {
                    if (remoteAssets.has(id)) continue;
                    if (cancelled || !isCurrentSession(userId, epoch, session)) return;
                    const state = await syncRequest<{state:'active'|'deleted'|'missing';asset?:CloudAsset}>(userId, `/api/assets/${id}`);
                    if (cancelled || !isCurrentSession(userId, epoch, session)) return;
                    if (state.state === 'active' && state.asset) remoteAssets.set(id,state.asset);
                    else if (state.state === 'deleted') confirmedDeleted.add(id);
                    else if (state.state !== 'missing') throw new Error('素材状态核对失败，请重新读取');
                }
                applying = true;
                if (saved && !snapshotReady) {
                    try {
                        const data = JSON.parse(saved) as Record<string, ProjectSyncBaseline>;
                        for (const [id, baseline] of Object.entries(data)) {
                            if (Number.isInteger(baseline?.version) && typeof baseline.updatedAt === "string") projectBaselines.set(id, baseline);
                        }
                    } catch { /* 损坏的基准不参与合并。 */ }
                }
                if (savedAssets && !snapshotReady) {
                    try {
                        const data = JSON.parse(savedAssets) as Record<string, ProjectSyncBaseline>;
                        for (const [id, baseline] of Object.entries(data)) {
                            if (Number.isInteger(baseline?.version) && typeof baseline.updatedAt === "string") assetBaselines.set(id, baseline);
                        }
                    } catch { /* 损坏的基准不参与合并。 */ }
                }
                const resolved = mergeProjects(projectResult.projects);
                mergeAssets([...remoteAssets.values()],confirmedDeleted);
                await saveBaselines(userId, epoch, session);
                if (cancelled || !isCurrentSession(userId, epoch, session)) return;
                resolved.forEach(clearProjectConflict);
                await saveAssetBaselines(userId, epoch, session);
                if (cancelled || !isCurrentSession(userId, epoch, session)) return;
                snapshotReady = true;
                snapshotError = '';
                notification.destroy(`sync-initialization-error:${userId}:${session}`);
                await syncAllNow();
            } catch (error) {
                if (!cancelled && isCurrentSession(userId,epoch,session)) {
                    snapshotError = error instanceof Error ? error.message || '云端读取或本地同步记录保存失败' : '云端读取失败';
                    notification.error({key:`sync-initialization-error:${userId}:${session}`,message:'云端同步失败',description:'当前内容保留在本页面；可点击重新同步恢复。',actions:retryAction(),duration:0});
                }
            } finally {
                loadingSnapshot = false;
                if (isCurrentSession(userId, epoch, session)) { applying = false; readingCloud = false; publishSyncStatus(); }
                if ((refreshRequested || (retryAfterSnapshot && !snapshotReady)) && !cancelled && isCurrentSession(userId, epoch, session)) {
                    refreshRequested = false;
                    retryAfterSnapshot = false;
                    void loadSnapshot();
                }
                if (!cancelled && isCurrentSession(userId, epoch, session) && !snapshotError) scheduleSync();
            }
            });
        };
        const entry = async () => {
            if (cancelled || !isCurrentSession(userId,epoch,session)) return;
            if (!snapshotReady || snapshotError || loadingSnapshot || saveErrors.size || projectBaselineDirty || assetBaselineDirty) await loadSnapshot();
            else await syncAll();
        };
        currentSyncEntry = entry;
        const onOnline = () => {
            if (cancelled || !isCurrentSession(userId, epoch, session)) return;
            if (!snapshotReady && loadingSnapshot) retryAfterSnapshot = true;
            else if (!snapshotReady) void loadSnapshot();
            else scheduleSync();
        };
        const onGenerationUpdated = (event: Event) => {
            if ((event as CustomEvent<{owner?: string}>).detail?.owner === userId) void loadSnapshot();
        };
        const onAssetView = () => { if (isCurrentSession(userId, epoch, session)) void loadSnapshot(); };
        window.addEventListener('sundas:generation-updated', onGenerationUpdated);
        window.addEventListener('sundas:assets-opened', onAssetView);
        window.addEventListener("online", onOnline);
        void loadSnapshot();

        return () => {
            cancelled = true;
            controller.abort();
            if (currentSyncEntry === entry) currentSyncEntry = undefined;
            if (syncRequests?.controller === controller) syncRequests = undefined;
            notification.destroy(`sync-initialization-error:${userId}:${session}`);
            notification.destroy('sync-baseline-error');
            for (const id of projectConflicts) notification.destroy(`canvas-conflict-${id}`);
            for (const id of assetConflicts) notification.destroy(`asset-conflict-${id}`);
            for (const key of saveErrors.keys()) {
                const [kind,id] = key.split(':');
                notification.destroy(`sync-error-${kind}-${id}`);
            }
            if (syncEpoch === epoch) syncEpoch++;
            unsubscribeCanvas();
            unsubscribeAssets();
            window.removeEventListener("online", onOnline);
            window.removeEventListener('sundas:generation-updated', onGenerationUpdated);
            window.removeEventListener('sundas:assets-opened', onAssetView);
            if (timer) window.clearTimeout(timer);
        };
    }, [assetHydrated, canvasHydrated, ready, userId, session]);
}
