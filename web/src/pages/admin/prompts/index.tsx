import { useEffect, useState } from "react";
import { App as AntApp, Button, Input, Modal, Select, Switch, Table, Tag } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { promptAdminApi, type PromptJob, type PromptJobSource, type PromptSource } from "@/services/api/admin/prompts";
import { useAdminRequest } from "../use-admin-request";
import { AdminField, AdminPanel } from "../components/ui";
import { useAdminPermissions } from "../permissions";

const labels: Record<string, string> = { queued: "等待中", running: "同步中", succeeded: "成功", partial_failed: "部分失败", failed: "失败", skipped: "已跳过" };
const time = (value: string | null) => value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "—";

export function PromptSourcesTab() {
    const request = useAdminRequest();
    const permissions = useAdminPermissions();
    const api = promptAdminApi(request);
    const { message } = AntApp.useApp();
    const [sources, setSources] = useState<PromptSource[]>([]);
    const [enabledFilter, setEnabledFilter] = useState("");
    const [jobs, setJobs] = useState<PromptJob[]>([]);
    const [page, setPage] = useState(1);
    const [total, setTotal] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [sourceFilter, setSourceFilter] = useState("");
    const [statusFilter, setStatusFilter] = useState("");
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState("");
    const [draft, setDraft] = useState<{ id: string; name: string; url: string; homepage: string; enabled: boolean } | null>(null);
    const [creating, setCreating] = useState(false);
    const [detail, setDetail] = useState<{ job: PromptJob; sources: PromptJobSource[] } | null>(null);
    const report = (error: unknown) => message.error(error instanceof Error ? error.message : String(error));
    async function load(current = page, source = sourceFilter, status = statusFilter) {
        setLoading(true);
        try {
            const [sourceData, jobData] = await Promise.all([api.sources(), api.jobs(current, source, status)]);
            setSources(sourceData.sources); setJobs(jobData.items); setTotal(jobData.total); setPageSize(jobData.pageSize); setPage(current);
        } catch (error) { report(error); } finally { setLoading(false); }
    }
    useEffect(() => { void load(1); }, [request]);
    async function toggle(source: PromptSource, enabled: boolean) {
        setBusy(source.id);
        try { await api.enable(source.id, enabled); await load(); } catch (error) { report(error); } finally { setBusy(""); }
    }
    async function sync(sourceId?: string) {
        setBusy(sourceId ?? "all");
        try {
            const result = await api.sync(sourceId);
            message.success(result.reused
                ? result.status === "queued" ? "来源已有等待中的同步任务，可在历史中查看" : "来源正在同步，可在历史中查看"
                : "同步任务已登记，请在历史中查看执行状态");
            if (result.existingJobIds.length && !result.reused) message.info("部分来源已有同步任务，请在历史中查看");
            await load(1);
        } catch (error) { report(error); } finally { setBusy(""); }
    }
    async function showJob(id: string) { try { setDetail(await api.job(id)); } catch (error) { report(error); } }
    async function saveSource() {
        if (!draft) return;
        setBusy('save');
        try { await api.save(draft, creating); setDraft(null); message.success('来源已保存，可单独提交同步'); await load(); }
        catch (error) { report(error); } finally { setBusy(''); }
    }
    const columns: TableColumnsType<PromptSource> = [
        { title: "来源", dataIndex: "name", render: (name: string, row) => <div><div>{name}</div><div className="text-xs text-[var(--admin-muted)] break-all">{row.url}</div></div> },
        { title: "启用", dataIndex: "enabled", render: (enabled: boolean, row) => <Switch checked={enabled} loading={busy === row.id} disabled={Boolean(busy) || !permissions.includes("prompts.manage")} onChange={(value) => void toggle(row, value)} /> },
        { title: "提示词数量", dataIndex: "promptCount" },
        { title: "最近成功", dataIndex: "lastSyncAt", render: time },
        { title: "最近错误", dataIndex: "lastError", render: (value: string) => value || "—" },
        { title: "操作", render: (_, row) => <div className="flex gap-2">{permissions.includes('prompts.manage') && <Button size="small" disabled={Boolean(busy)} onClick={() => { setCreating(false); setDraft({ id: row.id, name: row.name, url: row.url, homepage: row.homepage, enabled: row.enabled }); }}>编辑</Button>}{permissions.includes("prompts.sync") && <Button size="small" disabled={!row.enabled || Boolean(busy)} onClick={() => void sync(row.id)}>同步</Button>}</div> },
    ];
    const jobColumns: TableColumnsType<PromptJob> = [
        { title: "提交时间", dataIndex: "createdAt", render: time },
        { title: "方式", dataIndex: "trigger", render: (value: string) => value === "manual" ? "手动" : "自动" },
        { title: "操作人", dataIndex: "requestedByEmail", render: (value: string | null) => value ?? "系统" },
        { title: "状态", dataIndex: "status", render: (value: string) => <Tag>{labels[value] ?? value}</Tag> },
        { title: "完成时间", dataIndex: "finishedAt", render: time },
        { title: "操作", render: (_, row) => <Button size="small" onClick={() => void showJob(row.id)}>查看</Button> },
    ];
    const resultColumns: TableColumnsType<PromptJobSource> = [
        { title: "来源", dataIndex: "sourceName" }, { title: "状态", dataIndex: "status", render: (v: string) => labels[v] ?? v },
        { title: "读取", dataIndex: "fetched" }, { title: "保留", dataIndex: "kept" }, { title: "过滤", dataIndex: "filtered" },
        { title: "开始", dataIndex: "startedAt", render: time }, { title: "结束", dataIndex: "finishedAt", render: time }, { title: "说明", dataIndex: "error", render: (v: string) => v || "—" },
    ];
    return <div className="space-y-5">
        <AdminPanel title="提示词来源" description="停用后隐藏该来源，已同步内容保留。" actions={<div className="flex gap-2">{permissions.includes('prompts.manage') && <Button disabled={Boolean(busy)} onClick={() => { setCreating(true); setDraft({ id: '', name: '', url: '', homepage: '', enabled: false }); }}>新增来源</Button>}<Button onClick={() => void load()} loading={loading}>刷新</Button>{permissions.includes("prompts.sync") && <Button type="primary" disabled={Boolean(busy)} onClick={() => void sync()}>同步全部</Button>}</div>} flush>
            <div className="p-4"><Select value={enabledFilter} style={{minWidth:140}} onChange={setEnabledFilter} options={[{value:"",label:"全部来源"},{value:"enabled",label:"已启用"},{value:"disabled",label:"已停用"}]} /></div>
            <Table rowKey="id" columns={columns} dataSource={sources.filter(source => !enabledFilter || source.enabled === (enabledFilter === "enabled"))} loading={loading} pagination={false} scroll={{ x: 900 }} />
        </AdminPanel>
        <AdminPanel title="同步历史" description="同步结果需要刷新查看。" flush><div className="flex flex-wrap gap-2 p-4"><Select value={sourceFilter} style={{ minWidth: 220 }} options={[{ value: "", label: "全部来源" }, ...sources.map(source => ({ value: source.id, label: source.name }))]} onChange={value => { setSourceFilter(value); void load(1, value, statusFilter); }} /><Select value={statusFilter} style={{ minWidth: 140 }} options={[{ value: "", label: "全部状态" }, ...["queued", "running", "succeeded", "partial_failed", "failed"].map(value => ({ value, label: labels[value] }))]} onChange={value => { setStatusFilter(value); void load(1, sourceFilter, value); }} /></div><Table rowKey="id" columns={jobColumns} dataSource={jobs} loading={loading} pagination={{ current: page, total, pageSize, showSizeChanger: false, onChange: (value) => void load(value) }} scroll={{ x: 800 }} /></AdminPanel>
        <Modal title={creating ? '新增提示词来源' : '编辑提示词来源'} open={Boolean(draft)} confirmLoading={busy === 'save'} onOk={() => void saveSource()} onCancel={() => { if (!busy) setDraft(null); }} maskClosable={!busy} closable={!busy} okText="保存">
            <p className="mb-4 text-sm">来源需返回标准 JSON 数组，条目包含 title、prompt、coverUrl。保存后启用并提交同步，失败详情在同步历史查看。</p>
            {draft && <div className="space-y-3">
                <AdminField label="来源 ID（创建后不可修改）"><Input value={draft.id} disabled={!creating || Boolean(busy)} onChange={event => setDraft({ ...draft, id: event.target.value })} placeholder="例如 my-prompts" /></AdminField>
                <AdminField label="名称"><Input value={draft.name} disabled={Boolean(busy)} onChange={event => setDraft({ ...draft, name: event.target.value })} /></AdminField>
                <AdminField label="HTTPS JSON 地址"><Input value={draft.url} disabled={Boolean(busy)} onChange={event => setDraft({ ...draft, url: event.target.value })} /></AdminField>
                <AdminField label="来源主页（可选）"><Input value={draft.homepage} disabled={Boolean(busy)} onChange={event => setDraft({ ...draft, homepage: event.target.value })} /></AdminField>
                <AdminField label="启用"><Switch checked={draft.enabled} disabled={Boolean(busy)} onChange={enabled => setDraft({ ...draft, enabled })} /></AdminField>
            </div>}
        </Modal>
        <Modal title="同步结果" open={Boolean(detail)} onCancel={() => setDetail(null)} footer={<Button onClick={() => setDetail(null)}>关闭</Button>} width={1000}>
            <p>状态：{detail ? labels[detail.job.status] ?? detail.job.status : ""}　任务：{detail?.job.id}　操作人：{detail?.job.requestedByEmail ?? "系统"}</p>
            {detail?.job.error ? <p>{detail.job.error}</p> : null}
            <Table rowKey="sourceId" columns={resultColumns} dataSource={detail?.sources ?? []} pagination={false} scroll={{ x: 900 }} />
        </Modal>
    </div>;
}
