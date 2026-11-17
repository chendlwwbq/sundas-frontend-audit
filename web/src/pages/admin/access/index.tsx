import { useEffect, useState } from "react";
import { App, Button, Checkbox, Input, Modal, Select, Table } from "antd";
import type { TableColumnsType } from "antd";
import { accessApi, type AdminRole, type Administrator } from "@/services/api/admin/access";
import { useAdminRequest } from "../use-admin-request";
import { AdminField, AdminPanel } from "../components/ui";

type RoleDraft = { id?: string; code: string; name: string; description: string; permissions: string[] };
const emptyRole = (): RoleDraft => ({ code: "", name: "", description: "", permissions: [] });
const sections: Record<string, string> = { media: "用户私有素材", dashboard: "看板", prompts: "提示词源", users: "用户", credits: "积分", tasks: "任务", channels: "渠道", models: "模型", invites: "邀请返佣", orders: "订单", catalog: "套餐", announcements: "公告", promo: "宣发", redeem: "兑换码", settings: "系统设置", admins: "管理员", audit: "审计日志" };
const actions: Record<string, string> = { read: "查看", manage: "管理", sync: "同步", "reset-password": "重置密码", adjust: "调整积分", review: "登记核对", resolve: "处理冻结", export: "导出" };
function permissionLabel(value: string) {
    const [section, action] = value.split(".");
    return `${sections[section] ?? section}：${actions[action] ?? action}`;
}
export function AccessTab() {
    const request = useAdminRequest(); const api = accessApi(request); const { message, modal } = App.useApp();
    const [roles, setRoles] = useState<AdminRole[]>([]); const [all, setAll] = useState<string[]>([]); const [admins, setAdmins] = useState<Administrator[]>([]);
    const [loading, setLoading] = useState(false); const [saving, setSaving] = useState(false);
    const [role, setRole] = useState<RoleDraft | null>(null); const [assignment, setAssignment] = useState<{ id?: string; userId: string; roles: string[] } | null>(null);
    const report = (error: unknown) => message.error(error instanceof Error ? error.message : String(error));
    async function load() { setLoading(true); try { const [a, b] = await Promise.all([api.roles(), api.administrators()]); setRoles(a.roles); setAll(a.permissions); setAdmins(b.administrators); } catch (e) { report(e); } finally { setLoading(false); } }
    useEffect(() => { void load(); }, [request]);
    async function saveRole() { if (!role) return; setSaving(true); try { await api.saveRole(role.id, role); setRole(null); message.success("角色已保存"); await load(); } catch (e) { report(e); } finally { setSaving(false); } }
    async function saveAdmin() { if (!assignment) return; setSaving(true); try { if (assignment.id) await api.assign(assignment.id, assignment.roles); else await api.addAdmin(assignment.userId, assignment.roles); setAssignment(null); message.success("管理员角色已保存"); await load(); } catch (e) { report(e); } finally { setSaving(false); } }
    function removeRole(item: AdminRole) { modal.confirm({ title: `删除角色 ${item.name}？`, onOk: async () => { try { await api.deleteRole(item.id); await load(); } catch (e) { report(e); } } }); }
    function removeAdmin(item: Administrator) { modal.confirm({ title: `撤销 ${item.email} 的管理员身份？`, onOk: async () => { try { await api.remove(item.id); await load(); } catch (e) { report(e); } } }); }
    const roleColumns: TableColumnsType<AdminRole> = [
        { title: "角色", dataIndex: "name" }, { title: "代码", dataIndex: "code" }, { title: "管理员数", dataIndex: "userCount" },
        { title: "权限", render: (_, row) => row.code === "super_admin" ? "全部权限" : row.permissions.map(permissionLabel).join("、") || "无" },
        { title: "操作", render: (_, row) => <div className="flex gap-2"><Button size="small" disabled={row.code === "super_admin"} onClick={() => setRole({ id: row.id, code: row.code, name: row.name, description: row.description, permissions: row.permissions })}>编辑</Button><Button size="small" disabled={row.isSystem} onClick={() => removeRole(row)}>删除</Button></div> },
    ];
    const adminColumns: TableColumnsType<Administrator> = [
        { title: "账号", dataIndex: "email" }, { title: "昵称", dataIndex: "displayName" }, { title: "状态", dataIndex: "status", render: (v: string) => v === "active" ? "正常" : "已禁用" },
        { title: "角色", render: (_, row) => row.roleNames.join("、") || "未分配" },
        { title: "操作", render: (_, row) => <div className="flex gap-2"><Button size="small" onClick={() => setAssignment({ id: row.id, userId: row.id, roles: row.roleIds })}>分配角色</Button><Button size="small" danger onClick={() => removeAdmin(row)}>撤销</Button></div> },
    ];
    return <div className="space-y-5">
        <AdminPanel title="管理员" actions={<div className="flex gap-2"><Button onClick={() => void load()} loading={loading}>刷新</Button><Button type="primary" onClick={() => setAssignment({ userId: "", roles: [] })}>添加管理员</Button></div>} flush><Table rowKey="id" dataSource={admins} columns={adminColumns} loading={loading} pagination={false} scroll={{ x: 700 }} /></AdminPanel>
        <AdminPanel title="角色权限" actions={<Button onClick={() => setRole(emptyRole())}>新增角色</Button>} flush><Table rowKey="id" dataSource={roles} columns={roleColumns} loading={loading} pagination={false} scroll={{ x: 800 }} /></AdminPanel>
        <Modal title={role?.id ? "编辑角色" : "新增角色"} open={Boolean(role)} onCancel={() => setRole(null)} onOk={() => void saveRole()} confirmLoading={saving} width={760}>
            {role && <div className="space-y-3"><AdminField label="角色名称"><Input value={role.name} onChange={e => setRole({ ...role, name: e.target.value })} /></AdminField><AdminField label="角色代码"><Input disabled={Boolean(role.id)} value={role.code} onChange={e => setRole({ ...role, code: e.target.value })} /></AdminField><AdminField label="说明"><Input value={role.description} onChange={e => setRole({ ...role, description: e.target.value })} /></AdminField><AdminField label="权限"><Checkbox.Group value={role.permissions} onChange={values => setRole({ ...role, permissions: values as string[] })}><div className="space-y-2">{Object.entries(sections).map(([section, title]) => { const values = all.filter(value => value.startsWith(`${section}.`)); return values.length ? <div key={section} className="flex flex-wrap gap-x-3 gap-y-1"><span className="min-w-20 font-medium">{title}</span>{values.map(value => <Checkbox key={value} value={value}>{actions[value.split(".")[1]] ?? value}</Checkbox>)}</div> : null; })}</div></Checkbox.Group></AdminField></div>}
        </Modal>
        <Modal title={assignment?.id ? "分配角色" : "添加管理员"} open={Boolean(assignment)} onCancel={() => setAssignment(null)} onOk={() => void saveAdmin()} confirmLoading={saving}>
            {assignment && <div className="space-y-3">{!assignment.id && <AdminField label="已有用户 ID"><Input value={assignment.userId} onChange={e => setAssignment({ ...assignment, userId: e.target.value })} /></AdminField>}<AdminField label="角色"><Select mode="multiple" className="w-full" value={assignment.roles} options={roles.map(item => ({ value: item.id, label: item.name }))} onChange={value => setAssignment({ ...assignment, roles: value })} /></AdminField></div>}
        </Modal>
    </div>;
}
