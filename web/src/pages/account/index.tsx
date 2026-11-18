import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { App as AntApp, Alert, Button, Input, InputNumber, Segmented, Spin, Table, Tabs, Tag } from "antd";
import type { TableColumnsType } from "antd";
import dayjs from "dayjs";
import { ArrowUpRight, Check, Crown, Gift, ImagePlus, Inbox, Layers, Receipt, RefreshCw, Sparkles, Ticket } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";

import { BrandName } from "@/components/brand/brand-wordmark";
import { apiRequest } from "@/services/api/client";
import { useAuthStore } from "@/stores/use-auth-store";
import { matchesCanvasSession } from "@/lib/canvas/canvas-session";
import { formatGenerationDiscount } from "@/lib/membership";
import { availablePaymentProviders, paymentClient, type PaymentClient } from '@/lib/payment-client';
import "./account.css";

type Plan = { id: string; name: string; days: number; priceCents: number; monthlyCredits: number; tierId: string | null; tierName: string | null; tierLevel: number | null; description: string; generationDiscount: number; grantCredits: number };
type RechargePackage = { id: string; name: string; credits: number; priceCents: number; originalPriceCents: number | null; description: string; sort: number };
type SiteInfo = { creditPriceCents: number; minCredits: number; payTypes: string[]; providers: string[]; alipayProducts?: PaymentClient[] };
type OrderRow = { orderNo: string; type: string; credits: number; amountCents: number; refundAmountCents: number | null; fulfillmentIssue: string | null; provider: string; payType: string; status: string; createdAt: string; paidAt: string | null };
type LedgerRow = { id: number; type: string; amount: number; balanceAfter: number; remark: string | null; createdAt: string };

const formatTime = (value?: string | null) => (value ? dayjs(value).format("YYYY-MM-DD HH:mm") : "-");

export default function AccountPage() {
    const userId = useAuthStore((state) => state.user?.id ?? null);
    const epoch = useAuthStore((state) => state.sessionEpoch);
    const ready = useAuthStore((state) => state.ready);
    if (!ready || !userId) return null;
    return <AccountContent key={`${epoch}:${userId}`} />;
}

function useAccountScope() {
    const owner = useAuthStore((state) => state.user?.id ?? null);
    const epoch = useAuthStore((state) => state.sessionEpoch);
    return { owner, current: () => Boolean(owner && matchesCanvasSession(owner, epoch, useAuthStore.getState())) };
}

/* 所有二级页共用同一个面板骨架：标题 15/600 + 说明 12 + 右上操作。 */
function Panel({ title, desc, extra, bodyClassName, className, children }: {
    title?: ReactNode;
    desc?: ReactNode;
    extra?: ReactNode;
    bodyClassName?: string;
    className?: string;
    children: ReactNode;
}) {
    return (
        <section className={className ? `acct-panel ${className}` : "acct-panel"}>
            {title || extra ? (
                <header className="acct-panel-head">
                    <div className="min-w-0">
                        {title ? <h2 className="acct-panel-title">{title}</h2> : null}
                        {desc ? <p className="acct-panel-desc">{desc}</p> : null}
                    </div>
                    {extra ? <div className="acct-panel-extra">{extra}</div> : null}
                </header>
            ) : null}
            <div className={bodyClassName ? `acct-panel-body ${bodyClassName}` : "acct-panel-body"}>{children}</div>
        </section>
    );
}

function Loading() {
    return <div className="acct-loading"><Spin /></div>;
}

function RefreshAction({ loading, onRefresh }: { loading: boolean; onRefresh: () => void }) {
    const { t } = useTranslation();
    return (
        <Button type="text" size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={onRefresh}>
            {t("account.refresh")}
        </Button>
    );
}

function AccountContent() {
    const { t } = useTranslation();
    const user = useAuthStore((state) => state.user);
    const refreshWallet = useAuthStore((state) => state.refreshWallet);
    const [searchParams, setSearchParams] = useSearchParams();
    const requestedTab = searchParams.get("tab");
    const tab = ["overview", "membership", "recharge", "orders", "ledger", "redeem", "invite", "settings"].includes(requestedTab ?? "") ? requestedTab! : "overview";
    const setTab = (next: string) => setSearchParams({ tab: next });

    useEffect(() => {
        void refreshWallet();
    }, [refreshWallet]);

    return (
        // 外层必须是定高 flex 列：.jm-page 靠 flex:1 + overflow-y 自己滚。
        // 少了这层，.jm-page 的 flex:1 没有 flex 父级，高度退化成内容高，
        // 会被 layout 的 overflow-hidden 直接裁掉——表现就是二级页内容多了却没有滚动条。
        <div className="page-surface flex h-full flex-col overflow-hidden bg-background text-foreground">
            <main className="account-page jm-page">
                <div className="jm-page-inner">
                    <header className="jm-page-head">
                        <div className="min-w-0">
                            <h1 className="jm-page-title">{t("account.title")}</h1>
                            <p className="jm-page-desc truncate">{user?.email}</p>
                        </div>
                    </header>
                    <Tabs
                        className="account-tabs"
                        activeKey={tab}
                        onChange={setTab}
                        items={[
                            { key: "overview", label: t("account.overview"), children: <Overview onTab={setTab} /> },
                            { key: "membership", label: t("account.membership"), children: <Recharge membershipOnly /> },
                            { key: "recharge", label: t("account.recharge"), children: <Recharge /> },
                            { key: "orders", label: t("account.orders"), children: <Orders /> },
                            { key: "ledger", label: t("account.ledger"), children: <Ledger /> },
                            { key: "redeem", label: t("account.redeem"), children: <Redeem /> },
                            { key: "invite", label: t("account.invite"), children: <Invite /> },
                            { key: "settings", label: t("account.settings"), children: <Settings /> },
                        ]}
                    />
                </div>
            </main>
        </div>
    );
}

function Overview({ onTab }: { onTab: (tab: string) => void }) {
    const { t } = useTranslation();
    const wallet = useAuthStore((state) => state.wallet);
    const active = Boolean(wallet?.member);
    const available = wallet?.availableCredits ?? wallet?.balance ?? 0;

    const shortcuts = [
        { key: "orders", icon: Receipt, title: t("account.orders"), desc: t("account.quickOrdersDesc") },
        { key: "ledger", icon: Layers, title: t("account.ledger"), desc: t("account.quickLedgerDesc") },
        { key: "redeem", icon: Ticket, title: t("account.redeem"), desc: t("account.quickRedeemDesc") },
        { key: "invite", icon: Gift, title: t("account.invite"), desc: t("account.quickInviteDesc") },
    ];

    return (
        <div className="acct-stack">
            <div className="acct-overview-grid">
                <section className="acct-panel">
                    <div className="acct-panel-body">
                        <div className="acct-row-between">
                            <span className="acct-label">{t("account.balance")}</span>
                            <span className="acct-chip">{t("account.held")} · {wallet?.held ?? 0}</span>
                        </div>
                        <div className="acct-metric mt-3.5">{available}</div>
                        <p className="acct-note mt-2.5">{t("account.overviewHint")}</p>
                        <div className="acct-actions">
                            <button type="button" className="jm-btn jm-btn-primary" onClick={() => onTab("recharge")}>
                                {t("account.goRecharge")}
                            </button>
                            <button type="button" className="jm-btn jm-btn-secondary" onClick={() => onTab("ledger")}>
                                {t("account.ledger")}
                            </button>
                        </div>
                    </div>
                </section>
                <section className="acct-panel">
                    <div className="acct-panel-body">
                        <span className="acct-label">{t("account.member")}</span>
                        <div className="acct-member-name">
                            <span className={`acct-dot ${active ? "is-on" : ""}`} />
                            {active ? wallet?.tierName || wallet?.planName || t("account.member") : t("account.nonMember")}
                        </div>
                        <p className="acct-note mt-2">
                            {active ? t("account.memberUntil", { date: formatTime(wallet?.memberUntil) }) : t("account.freePlanHint")}
                        </p>
                        <div className="acct-kv">
                            <span>{t("account.discountLabel")}</span>
                            <span className="acct-kv-value">{formatGenerationDiscount(wallet?.generationDiscount)}</span>
                        </div>
                        <div className="acct-actions">
                            <Button block size="large" onClick={() => onTab("membership")}>
                                {active ? t("account.membership") : t("account.goMembership")}
                            </Button>
                        </div>
                    </div>
                </section>
            </div>

            <Panel title={t("account.quickEntry")} bodyClassName="is-flush">
                <div className="acct-quick-grid">
                    {shortcuts.map(({ key, icon: Icon, title, desc }) => (
                        <button key={key} type="button" className="acct-tile" onClick={() => onTab(key)}>
                            <span className="acct-tile-icon"><Icon aria-hidden /></span>
                            <span className="acct-tile-body">
                                <span className="acct-tile-title">{title}</span>
                                <span className="acct-tile-desc">{desc}</span>
                            </span>
                        </button>
                    ))}
                </div>
            </Panel>
        </div>
    );
}

function Recharge({ membershipOnly = false }: { membershipOnly?: boolean }) {
    const { t } = useTranslation();
    const { message, modal } = AntApp.useApp();
    const scope = useAccountScope();
    const wallet = useAuthStore((state) => state.wallet);
    const member = wallet?.member;
    const [site, setSite] = useState<SiteInfo | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [plans, setPlans] = useState<Plan[]>([]);
    const [packages, setPackages] = useState<RechargePackage[]>([]);
    const [packageId, setPackageId] = useState("");
    const [credits, setCredits] = useState(100);
    const [payType, setPayType] = useState("");
    const [provider, setProvider] = useState("");
    const [paying, setPaying] = useState(false);

    const loadSiteAndPlans = useCallback(async () => {
        setLoading(true);
        setLoadError("");
        try {
            const [siteData, planData, packageData] = await Promise.all([
                apiRequest<SiteInfo>("/api/site"),
                membershipOnly ? apiRequest<{ plans: Plan[] }>("/api/plans") : Promise.resolve({ plans: [] }),
                membershipOnly ? Promise.resolve({ packages: [] }) : apiRequest<{ packages: RechargePackage[] }>("/api/recharge-packages"),
            ]);
            if (!scope.current()) return;
            setSite(siteData);
            setPlans(planData.plans);
            setPackages(packageData.packages);
            const nextProvider = availablePaymentProviders(siteData, paymentClient())[0] ?? "";
            setProvider(nextProvider);
            setPayType(siteData.payTypes.find((value) => nextProvider !== "alipay" || value === "alipay") ?? "");
        } catch (error: unknown) {
            if (!scope.current()) return;
            const reason = error instanceof Error ? error.message : String(error);
            setLoadError(reason || "无法加载账户配置");
            message.error(reason);
        } finally {
            if (scope.current()) setLoading(false);
        }
    }, [message, membershipOnly]);

    useEffect(() => {
        void loadSiteAndPlans();
    }, [loadSiteAndPlans]);

    if (!site) {
        if (loadError) {
            return (
                <div className="mx-auto max-w-xl py-8">
                    <Alert
                        type="error"
                        showIcon
                        message="加载账户配置失败"
                        description={loadError}
                        action={
                            <Button size="small" icon={<RefreshCw className="size-3.5" />} loading={loading} onClick={() => void loadSiteAndPlans()}>
                                重试
                            </Button>
                        }
                    />
                </div>
            );
        }
        return <Loading />;
    }

    const selected = packages.find((item) => item.id === packageId) ?? null;
    const price = selected ? selected.priceCents / 100 : ((credits || 0) * site.creditPriceCents) / 100;
    const payTypes = site.payTypes.filter((value) => provider !== 'alipay' || value === 'alipay').map((value) => ({ value, label: value === "wxpay" ? t("account.wxpay") : t("account.alipay") }));
    const providers = availablePaymentProviders(site, paymentClient()).map((value) => ({ value, label: value === 'alipay' ? t('account.alipayOfficial') : value === "zpay" ? t("account.zpay") : t("account.epay") }));
    const payDisabled = site.providers.length === 0 || payTypes.length === 0;
    function selectProvider(value: string) {
        setProvider(value);
        setPayType(site!.payTypes.find((type) => (value !== 'alipay' || type === 'alipay') && type === payType) ?? site!.payTypes.find((type) => value !== 'alipay' || type === 'alipay') ?? '');
    }

    async function submit(payload: { type: "credits" | "plan"; credits?: number; planId?: string; packageId?: string }) {
        if (!scope.current()) return;
        if (!provider || !providers.some(item => item.value === provider) || !payTypes.some((type) => type.value === payType)) {
            message.error(t("account.payNotConfigured"));
            return;
        }
        const auth = useAuthStore.getState();
        const owner = auth.ready ? auth.user?.id : undefined;
        const session = auth.sessionEpoch;
        if (!owner) { message.error(t("account.paymentAccountChanged")); return; }
        const sameAccount = () => useAuthStore.getState().ready && useAuthStore.getState().user?.id === owner && useAuthStore.getState().sessionEpoch === session;
        setPaying(true);
        try {
            const order = await apiRequest<{ orderNo: string; payUrl: string; amountCents: number; credits: number; planDays: number | null; planName: string | null; upgradeQuote: { previousEndsAt: string } | null }>("/api/orders", { method: "POST", headers: { "X-Sundas-User": owner }, json: { ...payload, provider, payType, paymentClient: paymentClient() } });
            if (!sameAccount()) throw new Error(t("account.paymentAccountChanged"));
            const amount = (order.amountCents / 100).toFixed(2);
            const content = order.upgradeQuote
                ? t("account.upgradeConfirm", { amount, end: formatTime(order.upgradeQuote.previousEndsAt) })
                : payload.type === "plan"
                    ? t("account.planOrderConfirm", { amount, name: order.planName, days: order.planDays, credits: order.credits })
                    : t("account.creditOrderConfirm", { amount, credits: order.credits });
            let cancelled = false;
            modal.confirm({ title: t(order.upgradeQuote ? "account.upgradeConfirmTitle" : "account.orderConfirmTitle"), content, okText: t("account.upgradePay"), cancelText: t("account.upgradeCancel"), onOk: async () => {
                try {
                    if (!sameAccount()) throw new Error(t("account.paymentAccountChanged"));
                    const status = await apiRequest<{ order: { payable: boolean } }>(`/api/orders/${encodeURIComponent(order.orderNo)}`, { headers: { "X-Sundas-User": owner } });
                    if (cancelled) return;
                    if (!sameAccount()) throw new Error(t("account.paymentAccountChanged"));
                    if (!status.order.payable) throw new Error(t("account.paymentOrderUnavailable"));
                    window.location.href = order.payUrl;
                } catch (error) { setPaying(false); if (!cancelled) message.error(error instanceof Error ? error.message : String(error)); }
            }, onCancel: () => { cancelled = true; setPaying(false); } });
        } catch (error) {
            message.error(error instanceof Error ? error.message : String(error));
            setPaying(false);
        }
    }

    const benefits = [
        { icon: Sparkles, title: t("account.benefitCredits"), text: t("account.benefitCreditsDesc") },
        { icon: ImagePlus, title: t("account.benefitModalities"), text: t("account.benefitModalitiesDesc") },
        { icon: Layers, title: t("account.benefitShared"), text: t("account.benefitSharedDesc") },
    ];

    const payTypeControl = (
        <div className="flex flex-wrap items-center gap-2">
            <span className="acct-label">{t("account.payType")}</span>
            {payTypes.length ? (
                <Segmented options={payTypes} value={payType} onChange={(value) => setPayType(String(value))} />
            ) : (
                <span className="acct-note">{t("account.payNotConfigured")}</span>
            )}
            {providers.length > 1 ? (
                <Segmented options={providers} value={provider} onChange={(value) => selectProvider(String(value))} />
            ) : null}
        </div>
    );

    return (
        <div className="acct-stack">
            {membershipOnly && (
                <section className="acct-panel acct-hero">
                    <div className="acct-hero-body">
                        <div className="min-w-0">
                            <div className="acct-eyebrow">
                                <Crown className="size-4" />
                                <BrandName text="SUNDAS MEMBERSHIP" imageClassName="opacity-70" />
                            </div>
                            <h2 className="acct-hero-title">{t("account.membershipHeroTitle")}</h2>
                            <p className="acct-hero-desc">{t("account.membershipHeroDesc")}</p>
                        </div>
                        <div className="acct-hero-aside">
                            <span className="acct-label">{t("account.currentMember")}</span>
                            <div className="acct-member-name">
                                <span className={`acct-dot ${member ? "is-on" : ""}`} />
                                {member ? wallet?.tierName || wallet?.planName || t("account.member") : t("account.nonMember")}
                            </div>
                            <div className="acct-kv">
                                <span>{t("account.discountLabel")}</span>
                                <span className="acct-kv-value">{formatGenerationDiscount(wallet?.generationDiscount)}</span>
                            </div>
                            <p className="acct-note mt-3.5">
                                {member ? t("account.memberUntil", { date: formatTime(wallet?.memberUntil) }) : t("account.memberActiveHint")}
                            </p>
                        </div>
                    </div>
                    <div className="acct-benefit-grid">
                        {benefits.map(({ icon: Icon, title, text }) => (
                            <div key={title}>
                                <Icon aria-hidden className="size-4 text-foreground" />
                                <h3 className="acct-benefit-title">{title}</h3>
                                <p className="acct-benefit-desc">{text}</p>
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {payDisabled ? <Alert type="warning" showIcon message={t("account.payNotConfigured")} /> : null}

            {!membershipOnly && (
                <div className="acct-split">
                    <Panel title={t("account.recharge")} desc={t("account.priceHint", { price: (site.creditPriceCents / 100).toFixed(2), min: site.minCredits })}>
                        {packages.length ? (
                            <div className="acct-package-grid">
                                {packages.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setPackageId((current) => (current === item.id ? "" : item.id))}
                                        className={`acct-package ${packageId === item.id ? "is-active" : ""}`}
                                        aria-pressed={packageId === item.id}
                                    >
                                        <span className="acct-package-name">{item.name}</span>
                                        <span className="acct-package-price">
                                            ¥{(item.priceCents / 100).toFixed(2)}
                                            {item.originalPriceCents && item.originalPriceCents > item.priceCents ? (
                                                <span className="acct-package-origin">¥{(item.originalPriceCents / 100).toFixed(2)}</span>
                                            ) : null}
                                        </span>
                                        <span className="acct-package-meta">{t("account.packageCredits", { credits: item.credits })}</span>
                                        {item.description ? <span className="acct-package-desc">{item.description}</span> : null}
                                    </button>
                                ))}
                            </div>
                        ) : null}

                        <div className={`acct-amount-row ${packages.length ? "" : "is-first"}`}>
                            <div>
                                <label className="acct-label mb-2" htmlFor="account-credits">
                                    {t("account.customAmount")}
                                    <span className="acct-hint">{t("account.customCreditsHint", { min: site.minCredits })}</span>
                                </label>
                                <InputNumber
                                    id="account-credits"
                                    size="large"
                                    min={site.minCredits}
                                    step={10}
                                    value={credits}
                                    onChange={(value) => { setCredits(Number(value) || site.minCredits); setPackageId(""); }}
                                />
                            </div>
                        </div>
                    </Panel>

                    <Panel title={t("account.payInfo")} desc={t("account.paySummaryHint")}>
                        <span className="acct-label">{t("account.payAmount")}</span>
                        <div className="acct-pay-amount">¥{price.toFixed(2)}</div>
                        <p className="acct-note mt-2">
                            {selected ? t("account.selectedPackage", { name: selected.name, credits: selected.credits }) : t("account.packageCredits", { credits })}
                        </p>
                        <div className="acct-pay-block">
                            <span className="acct-label">{t("account.payType")}</span>
                            {payTypes.length ? (
                                <Segmented block options={payTypes} value={payType} onChange={(value) => setPayType(String(value))} />
                            ) : (
                                <span className="acct-note">{t("account.payNotConfigured")}</span>
                            )}
                        </div>
                        {providers.length > 1 ? (
                            <div className="acct-pay-block">
                                <span className="acct-label">{t("account.provider")}</span>
                                <Segmented block options={providers} value={provider} onChange={(value) => selectProvider(String(value))} />
                            </div>
                        ) : null}
                        <div className="acct-pay-footer">
                            <Button
                                type="primary"
                                size="large"
                                block
                                loading={paying}
                                disabled={payDisabled}
                                onClick={() => void submit(selected ? { type: "credits", packageId: selected.id } : { type: "credits", credits })}
                            >
                                {t("account.payNow")}
                            </Button>
                        </div>
                    </Panel>
                </div>
            )}

            {membershipOnly && (plans.length ? (
                <>
                    <Panel title={t("account.membershipPlans")} desc={t("account.membershipPlansDesc")} extra={payTypeControl}>
                        {member && <p className="acct-note mb-4">{t("account.renewalCurrentTerms")}</p>}
                        <div className="acct-plan-grid">
                            {plans.map((plan) => {
                                const current = wallet?.planId === plan.id;
                                return (
                                    <div key={plan.id} className={`acct-plan ${current ? "is-current" : ""}`}>
                                        <div className="acct-plan-meta">
                                            <span>{plan.tierLevel ? `LV.${plan.tierLevel} · ${plan.tierName}` : t("account.plans")}</span>
                                            {current ? <span className="acct-plan-badge">{t("account.currentPlan")}</span> : null}
                                        </div>
                                        <h3 className="acct-plan-name">{plan.name}</h3>
                                        <p className="acct-plan-desc">{plan.description || t("account.membershipPlansDesc")}</p>
                                        <div className="acct-plan-price">
                                            ¥{(plan.priceCents / 100).toFixed(2)}
                                            <span>/ {t("account.planDays", { days: plan.days })}</span>
                                        </div>
                                        <div className="acct-plan-discount">
                                            <span className="acct-label">{t("account.discountLabel")}</span>
                                            <div className="acct-plan-discount-value">{formatGenerationDiscount(plan.generationDiscount)}</div>
                                            <p className="acct-note mt-1.5">基础报价 100 积分，折后 {Math.ceil(100 * plan.generationDiscount)} 积分</p>
                                            <p className="acct-note">仅演示会员折扣，实际按模型及活动报价计费。</p>
                                        </div>
                                        <ul className="acct-plan-features">
                                            <li><Check aria-hidden className="size-3.5" />{t("account.planMonthly", { credits: plan.monthlyCredits })}</li>
                                            {plan.grantCredits > 0 && <li><Check aria-hidden className="size-3.5" />开通赠送 {plan.grantCredits} 积分</li>}
                                            <li><Check aria-hidden className="size-3.5" />工作台与画布共享会员折扣</li>
                                            <li><Check aria-hidden className="size-3.5" />有效期 {t("account.planDays", { days: plan.days })}</li>
                                        </ul>
                                        <Button
                                            type={current ? "primary" : "default"}
                                            loading={paying}
                                            disabled={payDisabled}
                                            onClick={() => void submit({ type: "plan", planId: plan.id })}
                                        >
                                            {current ? "续费当前套餐" : member ? "选择此套餐" : "开通会员"}
                                            <ArrowUpRight className="size-4" />
                                        </Button>
                                    </div>
                                );
                            })}
                        </div>
                    </Panel>

                    <section className="acct-panel">
                        <div className="acct-panel-body grid gap-6 sm:grid-cols-2">
                            <div>
                                <h3 className="acct-benefit-title mt-0">折扣如何生效？</h3>
                                <p className="acct-benefit-desc">开通后自动用于生成报价与扣费；最终积分向上取整，单次最低 1 积分。当前会员按购买时的折扣执行，新购或续费以订单确认的权益为准。</p>
                            </div>
                            <div>
                                <h3 className="acct-benefit-title mt-0">升级与续费如何计算？</h3>
                                <p className="acct-benefit-desc">同套餐续费延长有效期；升档仅覆盖原会员剩余时间，按新旧套餐价差及剩余时间比例计算，积分按周期差额折算。具体以订单确认信息为准。</p>
                            </div>
                        </div>
                    </section>
                </>
            ) : <Panel title={t("account.membershipPlans")}><EmptyState text="暂无可购买的会员套餐，请稍后再来。" /></Panel>)}
        </div>
    );
}

function EmptyState({ text }: { text: string }) {
    return (
        <div className="jm-empty">
            <span className="jm-empty-icon"><Inbox className="size-6" strokeWidth={1.5} /></span>
            <p className="jm-empty-title">{text}</p>
        </div>
    );
}

function Orders() {
    const { t } = useTranslation();
    const { message } = AntApp.useApp();
    const scope = useAccountScope();
    const [rows, setRows] = useState<OrderRow[]>([]);
    const [loading, setLoading] = useState(true);

    async function load() {
        if (!scope.owner || !scope.current()) return;
        setLoading(true);
        try {
            const data = await apiRequest<{ items: OrderRow[] }>("/api/orders?page=1&pageSize=20", { headers: { "X-Sundas-User": scope.owner } });
            if (scope.current()) setRows(data.items);
        } catch (error) {
            if (scope.current()) message.error(error instanceof Error ? error.message : String(error));
        } finally {
            if (scope.current()) setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    const statusMap: Record<string, { label: string; color: string }> = {
        pending: { label: t("account.orderPending"), color: "gold" },
        paid: { label: t("account.orderPaid"), color: "green" },
        closed: { label: t("account.orderClosed"), color: "default" },
        refunded: { label: t("account.orderRefunded"), color: "red" },
    };

    const columns: TableColumnsType<OrderRow> = [
        { title: t("account.orderNo"), dataIndex: "orderNo" },
        { title: t("account.type"), dataIndex: "type", render: (value: string) => (value === "plan" ? t("account.typePlan") : t("account.typeCredits")) },
        { title: t("account.amount"), dataIndex: "amountCents", align: "right", width: 116, render: (value: number) => `¥${(value / 100).toFixed(2)}` },
        { title: t("account.refundAmount"), dataIndex: "refundAmountCents", align: "right", width: 116, render: (value: number | null) => value == null ? "—" : `¥${(value / 100).toFixed(2)}` },
        { title: t("account.credits"), dataIndex: "credits", align: "right", width: 108 },
        { title: t("account.status"), dataIndex: "status", width: 210, render: (value: string, row) => <Tag color={row.fulfillmentIssue ? "orange" : statusMap[value]?.color}>{row.fulfillmentIssue ? t("account.orderReview") : statusMap[value]?.label ?? value}</Tag> },
        { title: t("account.createdAt"), dataIndex: "createdAt", width: 160, render: formatTime },
    ];

    return (
        <Panel
            title={t("account.ordersTitle")}
            desc={rows.some((row) => row.refundAmountCents != null) ? t("account.refundHint") : t("account.orderHint")}
            bodyClassName="is-flush"
            extra={<RefreshAction loading={loading} onRefresh={() => void load()} />}
        >
            <Table<OrderRow>
                className="account-table"
                rowKey="orderNo"
                size="middle"
                loading={loading}
                dataSource={rows}
                columns={columns}
                pagination={false}
                scroll={{ x: 860 }}
                locale={{ emptyText: <EmptyState text={t("account.noOrders")} /> }}
            />
        </Panel>
    );
}

function Ledger() {
    const { t } = useTranslation();
    const { message } = AntApp.useApp();
    const scope = useAccountScope();
    const [rows, setRows] = useState<LedgerRow[]>([]);
    const [loading, setLoading] = useState(true);

    async function load() {
        if (!scope.owner || !scope.current()) return;
        setLoading(true);
        try {
            const data = await apiRequest<{ items: LedgerRow[] }>("/api/ledger?page=1&pageSize=30", { headers: { "X-Sundas-User": scope.owner } });
            if (scope.current()) setRows(data.items);
        } catch (error) {
            if (scope.current()) message.error(error instanceof Error ? error.message : String(error));
        } finally {
            if (scope.current()) setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    const typeMap: Record<string, string> = {
        grant: t("account.ledgerGrant"),
        consume: t("account.ledgerConsume"),
        refund: t("account.ledgerRefund"),
        expire: t("account.ledgerExpire"),
        adjust: t("account.ledgerAdjust"),
    };

    const columns: TableColumnsType<LedgerRow> = [
        { title: t("account.type"), dataIndex: "type", width: 120, render: (value: string) => typeMap[value] ?? value },
        { title: t("account.amount"), dataIndex: "amount", align: "right", width: 120, render: (value: number) => <span className={value > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}>{value > 0 ? `+${value}` : value}</span> },
        { title: t("account.balanceAfter"), dataIndex: "balanceAfter", align: "right", width: 140 },
        { title: t("account.remark"), dataIndex: "remark", render: (value: string | null) => value ?? "-" },
        { title: t("account.createdAt"), dataIndex: "createdAt", width: 160, render: formatTime },
    ];

    return (
        <Panel
            title={t("account.ledgerTitle")}
            desc={t("account.records", { count: rows.length })}
            bodyClassName="is-flush"
            extra={<RefreshAction loading={loading} onRefresh={() => void load()} />}
        >
            <Table<LedgerRow>
                className="account-table"
                rowKey="id"
                size="middle"
                loading={loading}
                dataSource={rows}
                columns={columns}
                pagination={false}
                scroll={{ x: 720 }}
                locale={{ emptyText: <EmptyState text={t("account.noLedger")} /> }}
            />
        </Panel>
    );
}

function Redeem() {
    const { t } = useTranslation();
    const { message } = AntApp.useApp();
    const scope = useAccountScope();
    const refreshWallet = useAuthStore((state) => state.refreshWallet);
    const [code, setCode] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit() {
        if (!code.trim() || !scope.owner || !scope.current()) return;
        setLoading(true);
        try {
            const data = await apiRequest<{ credits: number }>("/api/redeem", { method: "POST", headers: { "X-Sundas-User": scope.owner }, json: { code: code.trim() } });
            if (!scope.current()) return;
            message.success(t("account.redeemSuccess", { credits: data.credits }));
            setCode("");
            await refreshWallet();
        } catch (error) {
            if (scope.current()) message.error(error instanceof Error ? error.message : String(error));
        } finally {
            if (scope.current()) setLoading(false);
        }
    }

    return (
        <div className="acct-split">
            <Panel title={t("account.redeemTitle")} desc={t("account.redeemHint")}>
                <div className="flex flex-col gap-3 sm:flex-row">
                    <Input
                        size="large"
                        className="sm:flex-1"
                        value={code}
                        onChange={(event) => setCode(event.target.value)}
                        placeholder={t("account.redeemPlaceholder")}
                        onPressEnter={() => void submit()}
                    />
                    <Button type="primary" size="large" className="sm:w-[112px]" loading={loading} onClick={() => void submit()}>
                        {t("account.redeemButton")}
                    </Button>
                </div>
            </Panel>
            <Panel title={t("account.redeemNotes")}>
                <ol className="acct-note-list">
                    <li className="acct-note-item">{t("account.redeemNote1")}</li>
                    <li className="acct-note-item">{t("account.redeemNote2")}</li>
                    <li className="acct-note-item">{t("account.redeemNote3")}</li>
                </ol>
            </Panel>
        </div>
    );
}

function Invite() {
    const { t } = useTranslation();
    const { message } = AntApp.useApp();
    const scope = useAccountScope();
    const [data, setData] = useState<{
        code: string;
        invitees: number;
        rebateCredits: number;
        revokedCredits: number;
        rebates: { orderNo: string; inviteeEmail: string; rebateCredits: number; rebatePercent: number; status: string; createdAt: string }[];
        invited: { email: string; status: string; totalRebate: number; createdAt: string }[];
    } | null>(null);
    const [loading, setLoading] = useState(true);

    async function load() {
        if (!scope.owner || !scope.current()) return;
        setLoading(true);
        try {
            const result = await apiRequest<NonNullable<typeof data>>("/api/invite", { headers: { "X-Sundas-User": scope.owner } });
            // 后端在新账户 / 灰度环境下可能缺字段，补齐再用，避免整页白屏
            if (scope.current()) setData({
                code: result?.code ?? "",
                invitees: result?.invitees ?? 0,
                rebateCredits: result?.rebateCredits ?? 0,
                revokedCredits: result?.revokedCredits ?? 0,
                rebates: result?.rebates ?? [],
                invited: result?.invited ?? [],
            });
        } catch (error) {
            if (scope.current()) message.error(error instanceof Error ? error.message : String(error));
        } finally {
            if (scope.current()) setLoading(false);
        }
    }

    useEffect(() => {
        void load();
    }, []);

    async function copy(value: string, okText: string) {
        if (!scope.current()) return;
        await navigator.clipboard?.writeText(value);
        if (scope.current()) message.success(okText);
    }

    if (loading && !data) return <Loading />;
    if (!data) return null;

    const inviteLink = `${window.location.origin}/register?invite=${data.code}`;

    const invitedColumns: TableColumnsType<(typeof data.invited)[number]> = [
        { title: t("account.inviteeEmail"), dataIndex: "email" },
        { title: t("account.rebateAmount"), dataIndex: "totalRebate", align: "right", width: 140, render: (value: number) => <span className="tabular-nums">{value}</span> },
        { title: t("account.status"), dataIndex: "status", width: 120, render: (value: string) => <Tag color={value === "active" ? "green" : "default"}>{value === "active" ? "正常" : "已禁用"}</Tag> },
        { title: t("account.createdAt"), dataIndex: "createdAt", width: 160, render: formatTime },
    ];

    const rebateColumns: TableColumnsType<(typeof data.rebates)[number]> = [
        { title: t("account.orderNo"), dataIndex: "orderNo" },
        { title: t("account.inviteeEmail"), dataIndex: "inviteeEmail" },
        { title: t("account.rebateAmount"), dataIndex: "rebateCredits", align: "right", width: 140, render: (value: number) => <span className="tabular-nums">{value}</span> },
        {
            title: t("account.status"),
            dataIndex: "status",
            width: 120,
            render: (value: string) => <Tag color={value === "granted" ? "green" : "red"}>{value === "granted" ? "已发放" : t("account.rebateRevoked")}</Tag>,
        },
        { title: t("account.createdAt"), dataIndex: "createdAt", width: 160, render: formatTime },
    ];

    return (
        <div className="acct-stack">
            <Panel title={t("account.inviteTitle")} desc={t("account.inviteHint")}>
                <div className="acct-code-row">
                    <span className="acct-code">{data.code}</span>
                    <Button onClick={() => void copy(data.code, t("account.copied"))}>{t("account.copyCode")}</Button>
                </div>
                <div className="acct-link-row">
                    <span className="acct-link">{inviteLink}</span>
                    <Button onClick={() => void copy(inviteLink, t("account.copiedLink"))}>{t("account.copyLink")}</Button>
                </div>
                <div className="acct-stat-grid">
                    <div className="acct-stat">
                        <span className="acct-label">{t("account.inviteesTotal")}</span>
                        <div className="acct-stat-value">{data.invitees}</div>
                    </div>
                    <div className="acct-stat">
                        <span className="acct-label">{t("account.rebateTotal")}</span>
                        <div className="acct-stat-value">{data.rebateCredits}</div>
                    </div>
                    <div className="acct-stat">
                        <span className="acct-label">{t("account.rebateRevoked")}</span>
                        <div className="acct-stat-value text-muted-foreground">{data.revokedCredits}</div>
                    </div>
                </div>
            </Panel>

            <Panel title={t("account.inviteFriends")} desc={t("account.records", { count: data.invited.length })} bodyClassName="is-flush">
                <Table
                    className="account-table"
                    rowKey="email"
                    size="middle"
                    dataSource={data.invited}
                    columns={invitedColumns}
                    pagination={false}
                    scroll={{ x: 640 }}
                    locale={{ emptyText: <EmptyState text={t("account.inviteEmpty")} /> }}
                />
            </Panel>

            <Panel title={t("account.inviteRebates")} desc={t("account.records", { count: data.rebates.length })} bodyClassName="is-flush">
                <Table
                    className="account-table"
                    rowKey="orderNo"
                    size="middle"
                    dataSource={data.rebates}
                    columns={rebateColumns}
                    pagination={false}
                    scroll={{ x: 720 }}
                    locale={{ emptyText: <EmptyState text={t("account.rebateEmpty")} /> }}
                />
            </Panel>
        </div>
    );
}

function Settings() {
    const { t } = useTranslation();
    const { message } = AntApp.useApp();
    const scope = useAccountScope();
    const user = useAuthStore((state) => state.user);
    const wallet = useAuthStore((state) => state.wallet);
    const changePassword = useAuthStore((state) => state.changePassword);
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [loading, setLoading] = useState(false);

    async function submit() {
        if (!scope.owner || !scope.current()) return;
        if (newPassword.length < 8) {
            message.error(t("auth.passwordTooShort"));
            return;
        }
        if (newPassword !== confirm) {
            message.error(t("auth.passwordMismatch"));
            return;
        }
        setLoading(true);
        try {
            await changePassword(oldPassword, newPassword, scope.owner);
            if (!scope.current()) return;
            message.success(t("account.passwordChanged"));
            setOldPassword("");
            setNewPassword("");
            setConfirm("");
        } catch (error) {
            if (scope.current()) message.error(error instanceof Error ? error.message : String(error));
        } finally {
            if (scope.current()) setLoading(false);
        }
    }

    return (
        <div className="acct-settings-grid">
            <Panel title={t("account.accountInfo")} desc={t("account.accountInfoHint")}>
                <div className="acct-info-row">
                    <span className="acct-label">{t("account.emailLabel")}</span>
                    <span className="acct-info-value">{user?.email}</span>
                </div>
                <div className="acct-info-row">
                    <span className="acct-label">{t("account.member")}</span>
                    <span className="acct-info-value">
                        {wallet?.member ? (wallet?.tierName || wallet?.planName || t("account.member")) : t("account.nonMember")}
                    </span>
                </div>
                <div className="acct-info-row">
                    <span className="acct-label">{t("account.balance")}</span>
                    <span className="acct-info-value tabular-nums">{wallet?.availableCredits ?? wallet?.balance ?? 0}</span>
                </div>
            </Panel>

            <Panel title={t("account.changePassword")} desc={t("account.passwordHint")}>
                <div className="acct-field-grid">
                    <label className="acct-field">
                        <span className="acct-label">{t("account.oldPassword")}</span>
                        <Input.Password size="large" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} autoComplete="current-password" />
                    </label>
                    <label className="acct-field">
                        <span className="acct-label">{t("account.newPassword")}</span>
                        <Input.Password size="large" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
                    </label>
                    <label className="acct-field">
                        <span className="acct-label">{t("account.confirmNewPassword")}</span>
                        <Input.Password size="large" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
                    </label>
                </div>
                <div className="acct-form-footer is-end">
                    <Button type="primary" size="large" loading={loading} onClick={() => void submit()}>
                        {t("account.savePassword")}
                    </Button>
                </div>
            </Panel>
        </div>
    );
}
