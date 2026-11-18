import type { PromoContactChannel } from "@/services/api/promo";

export const INTERNAL_LINK_OPTIONS = [
    { value: "/", label: "首页" },
    { value: "/image", label: "生图工作台" },
    { value: "/video", label: "视频创作台" },
    { value: "/prompts", label: "提示词库" },
    { value: "/assets", label: "我的资产" },
    { value: "/canvas", label: "我的画布" },
    { value: "/account", label: "账户" },
    { value: "/account?tab=recharge", label: "充值与会员" },
] as const;

export const CONTACT_CHANNEL_OPTIONS: { value: PromoContactChannel; label: string }[] = [
    { value: "wechat", label: "微信" },
    { value: "wechat_group", label: "微信群" },
    { value: "wecom", label: "企业微信" },
    { value: "qq", label: "QQ" },
    { value: "qq_group", label: "QQ群" },
    { value: "email", label: "邮箱" },
    { value: "phone", label: "电话" },
    { value: "telegram", label: "Telegram" },
    { value: "whatsapp", label: "WhatsApp" },
    { value: "link", label: "自定义链接" },
];

export const FREQUENCY_OPTIONS = [
    { value: "visit", label: "每次访问" },
    { value: "session", label: "每个会话一次" },
    { value: "24h", label: "每 24 小时一次" },
    { value: "daily", label: "每天一次" },
] as const;

export const ACTION_OPTIONS = [
    { value: "none", label: "不跳转" },
    { value: "internal", label: "站内路径" },
    { value: "external", label: "站外链接" },
    { value: "contact", label: "打开联系弹窗" },
    { value: "copy", label: "复制文本" },
] as const;

export function isAllowedInternalPath(value: string) {
    return INTERNAL_LINK_OPTIONS.some((option) => option.value === value);
}

export function contactChannelLabel(channel: PromoContactChannel) {
    return CONTACT_CHANNEL_OPTIONS.find((option) => option.value === channel)?.label ?? channel;
}
