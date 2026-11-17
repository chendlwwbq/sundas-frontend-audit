import { useEffect, useState } from "react";
import { App as AntApp, Button, Input, Modal, Table } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";

import { useAdminRequest } from "../use-admin-request";
import { AdminPanel } from "./ui";
import { CreditReview } from "../tasks/credit-review";
import { useAdminPermissions } from "../permissions";

type HeldTask = { id: string; type: string; status: string; modelName: string; upstreamId: string | null; submissionReference?: string | null; submissionRequests?: Record<string, string | null>; email: string; heldCredits: number | null; reservationMismatch: boolean; reservationIssue: string | null; createdAt: string; reconciliationRequired: boolean; imageRecheckable: boolean | null; error: string | null };
type LatestReview = {state:string;note:string;createdAt:string} | null;
type ExpiryIssue = { id: string; userId: string; email: string; amount: number; remaining: number; balance: number | null; expiresAt: string | null; latestReview:LatestReview };
type WalletIssue = { userId: string; email: string; balance: number | null; held: number | null; lotTotal: string; reservationTotal: string; latestReview:LatestReview };
type UnlinkedReservation = { id: string; email: string; amount: number; createdAt: string; latestReview:LatestReview };
const reviewLabels:Record<string,string>={pending:"待核对",follow_up:"继续跟进",resolved:"已核对"};
function latestReview(value:LatestReview) { return value ? `${reviewLabels[value.state] ?? value.state}：${value.note}` : "尚无记录"; }
function RefreshStatus({checkedAt,onRefresh}:{checkedAt:number|null;onRefresh:()=>void}) {
    return <div className="flex items-center gap-2"><span>查询时间：{checkedAt ? dayjs(checkedAt).format("YYYY-MM-DD HH:mm:ss") : "尚未查询"}</span><Button onClick={onRefresh}>刷新</Button></div>;
}

function UnlinkedReservations() {
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [data, setData] = useState<{ items: UnlinkedReservation[]; total: number }>({ items: [], total: 0 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [checkedAt, setCheckedAt] = useState<number|null>(null);
    async function load() {
        setLoading(true);
        try { setData(await apiRequest<{ items: UnlinkedReservation[]; total: number }>(`/api/admin/credits/unlinked-reservations?page=${page}&pageSize=20`)); setCheckedAt(Date.now()); }
        catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setLoading(false); }
    }
    useEffect(() => { void load(); }, [page]);
    const columns: TableColumnsType<UnlinkedReservation> = [
        { title: "用户", dataIndex: "email" },
        { title: "冻结记录 ID", dataIndex: "id", render: (id: string) => <span className="font-mono text-xs">{id}</span> },
        { title: "冻结积分", dataIndex: "amount", align: "right" },
        { title: "创建时间", dataIndex: "createdAt", render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm:ss") },
        { title: "最近核对", dataIndex:"latestReview", render:latestReview },
        { title: "核对", render: (_, row) => <CreditReview type="reservation" id={row.id} onUpdated={()=>void load()} /> },
    ];
    return <AdminPanel title="未关联任务的冻结" description="这些未关闭冻结没有关联任务，需要结合流水人工核对；此处不会自动释放积分。" actions={<RefreshStatus checkedAt={checkedAt} onRefresh={()=>void load()} />} flush>
        <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} scroll={{ x: 800 }} pagination={{ current: page, pageSize: 20, total: data.total, onChange: setPage }} />
    </AdminPanel>;
}

function WalletIssues() {
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [data, setData] = useState<{ items: WalletIssue[]; total: number }>({ items: [], total: 0 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [checkedAt, setCheckedAt] = useState<number|null>(null);
    async function load() {
        setLoading(true);
        try { setData(await apiRequest<{ items: WalletIssue[]; total: number }>(`/api/admin/credits/wallet-issues?page=${page}&pageSize=20`)); setCheckedAt(Date.now()); }
        catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setLoading(false); }
    }
    useEffect(() => { void load(); }, [page]);
    const columns: TableColumnsType<WalletIssue> = [
        { title: "用户", dataIndex: "email" },
        { title: "钱包可用", dataIndex: "balance", align: "right", render: (value: number | null) => value ?? "钱包不存在" },
        { title: "批次剩余合计", dataIndex: "lotTotal", align: "right" },
        { title: "钱包冻结", dataIndex: "held", align: "right", render: (value: number | null) => value ?? "钱包不存在" },
        { title: "未关闭冻结合计", dataIndex: "reservationTotal", align: "right" },
        { title: "最近核对", dataIndex:"latestReview", render:latestReview },
        { title: "核对", render: (_, row) => <CreditReview type="wallet" id={row.userId} onUpdated={()=>void load()} /> },
    ];
    return <AdminPanel title="钱包总账异常" description="对比钱包可用余额与所有批次剩余量，以及钱包冻结余额与未关闭冻结记录。这里只提供核对，不会自动修改账目。" actions={<RefreshStatus checkedAt={checkedAt} onRefresh={()=>void load()} />} flush>
        <Table rowKey="userId" columns={columns} dataSource={data.items} loading={loading} scroll={{ x: 900 }} pagination={{ current: page, pageSize: 20, total: data.total, onChange: setPage }} />
    </AdminPanel>;
}

function ExpiryIssues() {
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [data, setData] = useState<{ items: ExpiryIssue[]; total: number }>({ items: [], total: 0 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [checkedAt, setCheckedAt] = useState<number|null>(null);
    async function load() {
        setLoading(true);
        try { setData(await apiRequest<{ items: ExpiryIssue[]; total: number }>(`/api/admin/credits/expiry-issues?page=${page}&pageSize=20`)); setCheckedAt(Date.now()); }
        catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setLoading(false); }
    }
    useEffect(() => { void load(); }, [page]);
    const columns: TableColumnsType<ExpiryIssue> = [
        { title: "用户", dataIndex: "email" },
        { title: "批次 ID", dataIndex: "id", render: (id: string) => <span className="font-mono text-xs">{id}</span> },
        { title: "发放积分", dataIndex: "amount", align: "right" },
        { title: "批次剩余积分", dataIndex: "remaining", align: "right" },
        { title: "钱包余额", dataIndex: "balance", align: "right", render: (value: number | null) => value ?? "钱包不存在" },
        { title: "到期时间", dataIndex: "expiresAt", render: (value: string | null) => value ? dayjs(value).format("YYYY-MM-DD HH:mm:ss") : "无到期时间" },
        { title: "最近核对", dataIndex:"latestReview", render:latestReview },
        { title: "核对", render: (_, row) => <CreditReview type="lot" id={row.id} onUpdated={()=>void load()} /> },
    ];
    return <AdminPanel title="积分批次异常" description="列出剩余积分超过发放量的批次，以及余额不足或钱包不存在的已到期批次。请核对流水和冻结记录；此处不会自动修改账目。" actions={<RefreshStatus checkedAt={checkedAt} onRefresh={()=>void load()} />} flush>
        <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} scroll={{ x: 900 }} pagination={{ current: page, pageSize: 20, total: data.total, onChange: setPage }} />
    </AdminPanel>;
}

export function HeldTasksTab() {
    const permissions = useAdminPermissions();
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [data, setData] = useState<{ items: HeldTask[]; total: number }>({ items: [], total: 0 });
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [checkedAt, setCheckedAt] = useState<number|null>(null);
    const [target, setTarget] = useState<HeldTask | null>(null);
    const [action, setAction] = useState<"release" | "recheck" | "attach" | "terminal">("release");
    const [note, setNote] = useState("");
    const [upstreamId, setUpstreamId] = useState("");
    const [saving, setSaving] = useState(false);

    async function load() {
        setLoading(true);
        try { setData(await apiRequest<{ items: HeldTask[]; total: number }>(`/api/admin/tasks/held?page=${page}&pageSize=20`)); setCheckedAt(Date.now()); }
        catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setLoading(false); }
    }
    useEffect(() => { if (permissions.includes("tasks.read")) void load(); }, [page, permissions]);

    async function release() {
        if (!target || !note.trim()) { message.warning("请填写核查说明"); return; }
        setSaving(true);
        try {
            const result = await apiRequest<{ releasedCredits: number; expiredCredits: number }>(`/api/admin/tasks/${target.id}/release`, { method: "POST", json: { note } });
            message.success(`已返还 ${result.releasedCredits} 积分${result.expiredCredits ? `，${result.expiredCredits} 积分冻结期间已到期` : ""}`);
            setTarget(null); setNote(""); await load();
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setSaving(false); }
    }

    async function recheck() {
        if (!target || !note.trim()) { message.warning("请填写核查说明"); return; }
        setSaving(true);
        try {
            const result = await apiRequest<{ status: string }>(`/api/admin/tasks/${target.id}/recheck`, { method: "POST", json: { note } });
            if (result.status === "succeeded") message.success("上游已完成，结果已保存并结算");
            else if (result.status === "failed") message.success("上游确认失败，冻结积分已处理");
            else message.warning("上游状态或结果仍未确认，积分继续冻结");
            setTarget(null); setNote(""); await load();
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setSaving(false); }
    }

    async function attach() {
        if (!target || !note.trim() || !upstreamId.trim()) { message.warning("请填写上游任务 ID 和核查说明"); return; }
        setSaving(true);
        try {
            await apiRequest(`/api/admin/tasks/${target.id}/attach-upstream`, { method: "POST", json: { note, upstreamId } });
            message.success("已补录，请查询上游任务");
            setTarget(null); setNote(""); setUpstreamId(""); await load();
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setSaving(false); }
    }

    async function reconcileTerminal() {
        if (!target || !note.trim()) { message.warning("请填写核查说明"); return; }
        setSaving(true);
        try {
            const result = await apiRequest<{ settledCredits: number; releasedCredits: number; expiredCredits: number }>(`/api/admin/tasks/${target.id}/reconcile-terminal`, { method: "POST", json: { note } });
            message.success(result.settledCredits ? `已结算 ${result.settledCredits} 积分` : `已返还 ${result.releasedCredits} 积分${result.expiredCredits ? `，${result.expiredCredits} 积分冻结期间已到期` : ""}`);
            setTarget(null); setNote(""); await load();
        } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
        finally { setSaving(false); }
    }

    const columns: TableColumnsType<HeldTask> = [
        { title: "用户", dataIndex: "email" },
        { title: "任务 ID", dataIndex: "id", render: (id: string) => <span className="font-mono text-xs">{id}</span> },
        { title: "类型", dataIndex: "type" },
        { title: "模型", dataIndex: "modelName" },
        { title: "冻结积分", dataIndex: "heldCredits", align: "right", render: (value: number | null) => value ?? "无冻结记录" },
        { title: "上游任务 ID", dataIndex: "upstreamId", render: (id: string | null) => id || "未记录" },
        { title: "核对状态", render: (_value, row) => row.heldCredits === null ? row.error || "缺少有效冻结记录，需人工核对" : row.reservationMismatch ? row.reservationIssue || "冻结记录或消费流水异常，需人工核对" : !["queued", "running"].includes(row.status) ? `任务已${row.status === "succeeded" ? "成功" : "结束"}，冻结未关闭` : row.reconciliationRequired ? row.error || "需要人工核对" : "运行中" },
        { title: "创建时间", dataIndex: "createdAt", render: (value: string) => dayjs(value).format("YYYY-MM-DD HH:mm:ss") },
        { title: "处理", render: (_value, row) => row.heldCredits === null || row.reservationMismatch ? "请人工核对账目" : !["queued", "running"].includes(row.status) ? permissions.includes("tasks.resolve") ? <Button size="small" onClick={() => { setAction("terminal"); setTarget(row); setNote(""); }}>核对冻结</Button> : "—" : row.upstreamId
            ? permissions.includes("tasks.review") ? <Button size="small" disabled={!row.reconciliationRequired || (row.type !== "video" && !(row.type === 'image' && row.imageRecheckable))} onClick={() => { setAction("recheck"); setTarget(row); setNote(""); }}>查询上游</Button> : "—"
            : <div className="flex gap-2">{permissions.includes("tasks.resolve") && <Button size="small" onClick={() => { setAction("release"); setTarget(row); setNote(""); }}>核查并释放</Button>}{permissions.includes("tasks.review") && (row.type === "video" || (row.type === 'image' && row.imageRecheckable)) && row.reconciliationRequired && <Button size="small" onClick={() => { setAction("attach"); setTarget(row); setNote(""); setUpstreamId(row.submissionReference || ""); }}>补录上游 ID</Button>}</div> },
    ];
    return <>
        {permissions.includes("tasks.read") && <AdminPanel title="任务核对" description="显示未关闭冻结的任务，以及缺少有效冻结记录的未完成任务。已有上游任务 ID 的视频及支持核对的图片任务请通过上游核查；不要仅凭等待时间判断失败。" actions={<RefreshStatus checkedAt={checkedAt} onRefresh={()=>void load()} />} flush>
            <Table rowKey="id" columns={columns} dataSource={data.items} loading={loading} scroll={{ x: 1100 }} pagination={{ current: page, pageSize: 20, total: data.total, onChange: setPage }} />
        </AdminPanel>}
        {permissions.includes("credits.read") && <><ExpiryIssues /><WalletIssues /><UnlinkedReservations /></>}
        <Modal title={action === "recheck" ? "查询上游任务" : action === "attach" ? "补录上游任务 ID" : action === "terminal" ? "核对已结束任务的冻结" : "确认核查并释放积分"} open={Boolean(target)} onCancel={() => setTarget(null)} onOk={() => void (action === "recheck" ? recheck() : action === "attach" ? attach() : action === "terminal" ? reconcileTerminal() : release())} confirmLoading={saving} okText={action === "recheck" ? "查询一次" : action === "attach" ? "确认补录" : action === "terminal" ? "确认处理冻结" : "标记失败并释放"} cancelText="取消">
            <p>{action === "recheck" ? "将查询上游并尝试保存结果；确认成功或失败后按结果结算，无法确认时继续冻结积分。" : action === "attach" ? "请先确认此 ID 属于该用户、该渠道和这次生成任务；补录后可查询上游，不会重新创建任务。" : action === "terminal" ? `请先核实任务结果和积分账目。确认后，${target?.status === "succeeded" ? "按成功处理并结算冻结积分" : "按失败处理并释放仍有效的冻结积分"}。` : "仅在确认上游没有成功处理、且任务不会继续返回结果后执行。此操作不会取消上游任务，结果和费用需自行核对。"}</p>
            {action === "attach" && <label className="mt-3 block">上游任务 ID<Input value={upstreamId} onChange={(event) => setUpstreamId(event.target.value)} /></label>}
            <label className="mt-3 block">核查说明<Input.TextArea value={note} onChange={(event) => setNote(event.target.value)} maxLength={300} rows={3} /></label>
        </Modal>
    </>;
}
