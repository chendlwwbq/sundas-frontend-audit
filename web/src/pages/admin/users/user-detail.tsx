import { useEffect, useState } from "react";
import { App, Button, Descriptions, Drawer, Input, Modal, Table, Tabs } from "antd";
import { adminUserApi, type UserDetails } from "@/services/api/admin/users";
import { accessApi } from "@/services/api/admin/access";
import { useAdminRequest } from "../use-admin-request";
import { AdminField } from "../components/ui";
import { Link } from "react-router-dom";

const groups: Record<string, { label: string; permission: string }> = { ledger: { label: "积分流水", permission: "credits.read" }, orders: { label: "订单", permission: "orders.read" }, tasks: { label: "任务", permission: "tasks.read" }, invites: { label: "邀请", permission: "invites.read" }, audit: { label: "管理记录", permission: "audit.read" } };
const names: Record<string,string> = { id: "编号", type: "类型", amount: "数量", balanceAfter: "流水后余额", remark: "说明", createdAt: "创建时间", orderNo: "订单号", status: "状态", amountCents: "金额（分）", credits: "积分", paidAt: "支付时间", modelName: "模型", creditsHeld: "冻结积分", creditsCharged: "结算积分", error: "错误", finishedAt: "完成时间", inviterId: "邀请人", inviteeId: "被邀请人", totalRebate: "累计返佣", adminId: "操作人", action: "操作", targetType: "对象类型" };
export function UserDetail({ userId, onClose, onChanged }: { userId: string | null; onClose: () => void; onChanged: () => void }) {
    const request = useAdminRequest(), api = adminUserApi(request); const { message } = App.useApp();
    const [data,setData] = useState<UserDetails | null>(null), [permissions,setPermissions] = useState<string[]>([]);
    const [kind,setKind] = useState(""), [rows,setRows] = useState<Record<string,unknown>[]>([]), [page,setPage] = useState(1), [total,setTotal] = useState(0), [size,setSize] = useState(20);
    const [nickname,setNickname] = useState(""), [password,setPassword] = useState(""), [note,setNote] = useState(""), [resetOpen,setResetOpen] = useState(false), [saving,setSaving] = useState(false);
    const report = (error: unknown) => message.error(error instanceof Error ? error.message : String(error));
    useEffect(() => { setData(null); setRows([]); setTotal(0); setKind(""); setPassword(""); setNote(""); setResetOpen(false); if (!userId) return; let active=true; Promise.all([api.detail(userId),accessApi(request).me()]).then(([detail,access]) => { if (!active) return; setData(detail); setNickname(detail.user.displayName); setPermissions(access.permissions); setKind(Object.keys(groups).find(key => access.permissions.includes(groups[key].permission)) ?? ""); setPage(1); }).catch(error => { if (active) report(error); }); return () => { active=false; }; }, [userId,request]);
    useEffect(() => { if (!userId || !kind) return; let active=true; api.records(userId,kind,page).then(result => { if(active) {setRows(result.items);setTotal(result.total);setSize(result.pageSize);} }).catch(report); return () => {active=false;}; }, [userId,kind,page,request]);
    async function saveName() { if (!userId) return; setSaving(true); try { await api.nickname(userId,nickname); message.success("昵称已保存"); setData(await api.detail(userId)); onChanged(); } catch(e) {report(e);} finally {setSaving(false);} }
    async function reset() { if (!userId) return; setSaving(true); try { await api.resetPassword(userId,password,note); setPassword("");setNote("");setResetOpen(false);message.success("密码已重置，原会话已退出"); } catch(e) {report(e);} finally {setSaving(false);} }
    const columns = rows.length ? Object.keys(rows[0]).map(key => ({ title:names[key] ?? key, dataIndex:key, key, render:(value:unknown) => value == null ? "—" : String(value) })) : [];
    return <><Drawer title="用户详情" open={Boolean(userId)} onClose={onClose} width={900}>
        {data && data.user.id === userId && <div className="space-y-4"><Descriptions bordered size="small" column={2} items={[{key:"id",label:"用户 ID",children:data.user.id},{key:"email",label:"邮箱",children:data.user.email},{key:"status",label:"状态",children:data.user.status},{key:"role",label:"身份",children:data.user.role},{key:"created",label:"注册时间",children:data.user.createdAt},{key:"login",label:"最近登录",children:data.user.lastLoginAt ?? "—"}]} />
        <div className="flex gap-2"><Input value={nickname} disabled={!permissions.includes("users.manage")} onChange={e=>setNickname(e.target.value)} placeholder="昵称" />{permissions.includes("users.manage") && <Button loading={saving} onClick={()=>void saveName()}>保存昵称</Button>}{permissions.includes("users.reset-password") && <Button onClick={()=>setResetOpen(true)}>重置密码</Button>}</div>
        <div className="flex gap-4">{permissions.includes("tasks.read") && <Link to={`/admin?tab=tasks&userId=${encodeURIComponent(data.user.id)}`}>查看该用户全部任务</Link>}{permissions.includes("invites.read") && <Link to={`/admin?tab=invite&userId=${encodeURIComponent(data.user.id)}`}>查看该用户邀请记录</Link>}</div>
        {data.wallet && <p>钱包余额：{String(data.wallet.balance ?? 0)}　有效可用：{String(data.wallet.availableCredits ?? 0)}　冻结：{String(data.wallet.held ?? 0)}</p>}
        {data.subscriptions.length > 0 && <p>会员：{data.subscriptions.map(s=>`${s.planName} (${s.status}) ${s.endsAt}`).join("；")}</p>}
        <Tabs activeKey={kind} onChange={value=>{setKind(value);setPage(1);setRows([]);}} items={Object.entries(groups).filter(([,v])=>permissions.includes(v.permission)).map(([key,v])=>({key,label:v.label}))} />
        {kind && <Table rowKey={(row,index)=>String(row.id ?? index)} size="small" dataSource={rows} columns={columns} scroll={{x:true}} pagination={{current:page,total,pageSize:size,showSizeChanger:false,onChange:setPage}} />}</div>}
    </Drawer><Modal title="重置密码" open={resetOpen} onCancel={()=>{setResetOpen(false);setPassword("");setNote("");}} onOk={()=>void reset()} confirmLoading={saving}><div className="space-y-3"><AdminField label="新密码"><Input.Password value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" /></AdminField><AdminField label="重置原因"><Input value={note} onChange={e=>setNote(e.target.value)} /></AdminField></div></Modal></>;
}
