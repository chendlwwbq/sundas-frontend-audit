import { useEffect, useState } from "react";
import { App as AntApp, Button, Table } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { RefreshCw } from "lucide-react";

import { useAdminRequest } from "../use-admin-request";
import { AdminPanel } from "./ui";

const ACTION_LABELS: Record<string, string> = {
    "admin.remove": "移除管理员",
    "admin.roles": "调整管理员角色",
    "admin_role.create": "创建管理员角色",
    "admin_role.update": "更新管理员角色",
    "admin_role.delete": "删除管理员角色",
    "announcement.create": "创建公告",
    "announcement.update": "更新公告",
    "announcement.delete": "删除公告",
    "channel.create": "创建渠道",
    "channel.update": "更新渠道",
    "channel.delete": "删除渠道",
    "channel.test": "测试渠道",
    "channel.image_configure": "配置图片渠道",
    "channel.text_configure": "配置文本渠道",
    "credit.review_note": "登记积分核对备注",
    "invite.settings": "更新邀请设置",
    "invite.relation.update": "更新邀请关系",
    "membership_tier.update": "更新会员等级",
    "model.create": "创建模型",
    "model.update": "更新模型",
    "model.delete": "删除模型",
    "model.poster_price_update": "更新模型封面价格",
    "model_family.create": "创建模型系列",
    "model_family.update": "更新模型系列",
    "model_family.delete": "删除模型系列",
    "order.refund": "订单退款",
    "order.record_external_refund": "登记外部退款",
    "payment_notification.review": "核对支付通知",
    "payment.invalid_signature": "支付通知验签失败",
    "plan.create": "创建会员套餐",
    "plan.update": "更新会员套餐",
    "plan.delete": "删除会员套餐",
    "promo.item.create": "创建宣发内容",
    "promo.item.update": "更新宣发内容",
    "promo.item.delete": "删除宣发内容",
    "promo.item.auto_disable": "自动下线宣发内容",
    "promo.contact.create": "创建宣发联系人",
    "promo.contact.update": "更新宣发联系人",
    "promo.contact.delete": "删除宣发联系人",
    "promo.carousel.order": "调整轮播顺序",
    "promo.contact.order": "调整联系人顺序",
    "prompt.create": "创建提示词",
    "prompt.update": "更新提示词",
    "prompt.delete": "删除提示词",
    "prompt_source.create": "创建提示词源",
    "prompt_source.update": "更新提示词源",
    "prompt.sync": "同步提示词",
    "recharge_package.create": "创建充值套餐",
    "recharge_package.update": "更新充值套餐",
    "recharge_package.delete": "删除充值套餐",
    "redeem.batch": "创建兑换批次",
    "redeem.void": "作废兑换码",
    "redeem.export": "导出兑换码",
    "settings.update": "更新系统设置",
    "task.attach_upstream": "补录上游任务 ID",
    "task.recheck": "重新查询上游任务",
    "task.recheck_result": "记录上游任务查询结果",
    "task.reconcile_terminal": "核对任务终态",
    "task.release": "释放任务冻结",
    "task.review_note": "登记任务核对备注",
    "user.batch_status": "批量修改用户状态",
    "user.credits": "调整用户积分",
    "user.reset_password": "重置用户密码",
    "user.update": "更新用户",
};
const TARGET_LABELS: Record<string, string> = {
    admin_role: "管理员角色",
    announcement: "公告",
    channel: "渠道",
    invite_relation: "邀请关系",
    membership_tier: "会员等级",
    model: "模型",
    model_family: "模型系列",
    order: "订单",
    payment_notification: "支付通知",
    plan: "会员套餐",
    promo_contact: "宣发联系人",
    promo_item: "宣发条目",
    prompt: "提示词",
    prompt_source: "提示词源",
    prompt_sync: "提示词同步",
    recharge_package: "充值套餐",
    redeem_batch: "兑换批次",
    redeem_code: "兑换码",
    settings: "系统设置",
    task: "任务",
    user: "用户",
};
function targetLabel(type: string) {
    return TARGET_LABELS[type] ?? (type.startsWith("credit_") ? "积分异常记录" : type);
}

type AuditRow = {
    id: number;
    action: string;
    targetType: string;
    targetId: string | null;
    before: unknown;
    after: unknown;
    ip: string | null;
    createdAt: string;
    adminEmail: string;
};

export function AuditTab() {
    const apiRequest = useAdminRequest();
    const { message } = AntApp.useApp();
    const [items, setItems] = useState<AuditRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);

    async function load() {
        setLoading(true);
        try {
            const data = await apiRequest<{ items: AuditRow[]; total: number }>(`/api/admin/audit?page=${page}&pageSize=20`);
            setItems(data.items);
            setTotal(data.total);
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, [page]);

    const columns: TableColumnsType<AuditRow> = [
        { title: "时间", dataIndex: "createdAt", render: (value: string) => <span className="tabular-nums text-[var(--admin-muted)]">{dayjs(value).format("YYYY-MM-DD HH:mm:ss")}</span> },
        { title: "管理员", dataIndex: "adminEmail", render: (value: string) => <span className="text-[var(--admin-ink)]">{value}</span> },
        { title: "动作", dataIndex: "action", render: (value: string) => <span title={value} className="font-medium text-[var(--admin-ink)]">{ACTION_LABELS[value] ?? value}</span> },
        { title: "对象", key: "target", render: (_value, record) => <span title={record.targetType} className="text-[var(--admin-muted)]">{targetLabel(record.targetType)}{record.targetId ? ` · ${record.targetId}` : ""}</span> },
        { title: "IP", dataIndex: "ip", render: (value: string | null) => <span className="tabular-nums text-[var(--admin-muted)]">{value ?? "-"}</span> },
    ];

    return (
        <AdminPanel
            title="操作记录"
            description="系统只追加不修改，按时间倒序排列；展开一行可查看变更前后的数据。"
            actions={<Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void load()}>刷新</Button>}
            flush
        >
            <Table<AuditRow>
                rowKey="id"
                loading={loading}
                dataSource={items}
                columns={columns}
                scroll={{ x: 860 }}
                pagination={{ current: page, pageSize: 20, total, onChange: setPage, showSizeChanger: false }}
                expandable={{
                    expandedRowRender: (record) => (
                        <pre className="max-h-64 overflow-auto rounded-[10px] border border-[var(--admin-line)] bg-[var(--admin-panel-soft)] p-4 text-xs leading-5 text-[var(--admin-muted)]">
                            {JSON.stringify({ before: record.before, after: record.after }, null, 2)}
                        </pre>
                    ),
                }}
            />
        </AdminPanel>
    );
}
