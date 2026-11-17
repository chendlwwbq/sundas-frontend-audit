import { create } from "zustand";

import { apiRequest } from "@/services/api/client";
import { createSerializedWriter } from "@/lib/serialized-writer";
import { useCanvasUiStore } from "@/stores/canvas/use-canvas-ui-store";
import { useWorkbenchAgentStore } from "@/stores/use-workbench-agent-store";
import { broadcastSessionChange } from "@/lib/session-broadcast";
import { clearSessionMediaCaches } from "@/lib/media-object-urls";

const authTransitions = createSerializedWriter();
let authEpoch = 0;
let walletRequest = 0;

async function switchCachedAccount(userId: string | null) {
    const [{ switchCanvasAccount, flushCanvasAccount }, { switchAssetAccount, flushAssetAccount }] = await Promise.all([
        import("@/stores/canvas/use-canvas-store"), import("@/stores/use-asset-store"),
    ]);
    const flushes = await Promise.allSettled([flushCanvasAccount(), flushAssetAccount()]);
    const flushError = flushes.find((item): item is PromiseRejectedResult => item.status === "rejected");
    if (flushError) throw flushError.reason;
    const switches = await Promise.allSettled([switchCanvasAccount(userId, true), switchAssetAccount(userId, true)]);
    const switchError = switches.find((item): item is PromiseRejectedResult => item.status === "rejected");
    if (switchError) throw switchError.reason;
}

export type AuthUser = {
    id: string;
    email: string;
    displayName: string;
    role: "user" | "admin";
    status: "active" | "banned";
};

export type WalletState = {
    balance: number;
    availableCredits?: number;
    held: number;
    member: boolean;
    memberUntil: string | null;
    planName?: string | null;
    planId?: string | null;
    tierName?: string | null;
    tierLevel?: number | null;
    generationDiscount?: number;
    monthlyCredits?: number;
    storage?: { usedBytes: number; limitBytes: number };
};

type AuthState = {
    user: AuthUser | null;
    wallet: WalletState | null;
    ready: boolean;
    sessionEpoch: number;
    hydrate: () => Promise<void>;
    externalSessionChanged: () => Promise<void>;
    refreshWallet: () => Promise<void>;
    login: (email: string, password: string) => Promise<AuthUser>;
    register: (email: string, code: string, password: string, inviteCode?: string) => Promise<AuthUser>;
    logout: () => Promise<void>;
    sendCode: (email: string, purpose: "register" | "reset") => Promise<void>;
    resetPassword: (email: string, code: string, password: string) => Promise<void>;
    changePassword: (oldPassword: string, newPassword: string, expectedUserId?: string) => Promise<void>;
};

async function hydrateNow(set: (state: Partial<AuthState>) => void) {
    const epoch = authEpoch;
    const safeSet = (state: Partial<AuthState>) => { if (authEpoch === epoch) set(state); };
    safeSet({ ready: false, user: null, wallet: null });
    try {
        let data: { user: AuthUser | null; wallet?: WalletState };
        try { data = await apiRequest<{ user: AuthUser | null; wallet?: WalletState }>("/api/auth/me"); }
        catch { throw new Error("无法确认登录状态，请检查网络后刷新页面"); }
        if (authEpoch !== epoch) return;
        try { await switchCachedAccount(data.user?.id ?? null); }
        catch (error) {
            if (error instanceof Error && error.name === "LocalMediaOwnershipError") throw new Error(error.message);
            throw new Error("本地账户数据加载失败，请检查浏览器存储后刷新页面");
        }
        safeSet({ user: data.user, wallet: data.user ? (data.wallet ?? null) : null });
    } finally { safeSet({ ready: true }); }
}

export const useAuthStore = create<AuthState>((set, get) => ({
    user: null,
    wallet: null,
    ready: false,
    sessionEpoch: 0,

    hydrate: () => authTransitions.write(async () => { authEpoch += 1; set({ sessionEpoch: authEpoch }); await hydrateNow(set); }),

    externalSessionChanged: () => {
        const epoch = ++authEpoch;
        set({ ready: false, user: null, wallet: null, sessionEpoch: epoch });
        return authTransitions.write(async () => { if (authEpoch === epoch) await hydrateNow(set); });
    },

    refreshWallet: async () => {
        const owner = get().user?.id;
        const epoch = authEpoch;
        if (!owner || !get().ready) return;
        const request = ++walletRequest;
        const wallet = await apiRequest<WalletState>("/api/wallet", { headers: { "X-Sundas-User": owner } });
        if (get().ready && get().user?.id === owner && authEpoch === epoch && request === walletRequest) set({ wallet });
    },

    login: (email, password) => authTransitions.write(async () => {
        authEpoch += 1;
        const epoch = authEpoch;
        set({ ready: false, sessionEpoch: authEpoch });
        try {
            try { await switchCachedAccount(null); }
            catch { throw new Error("本地数据保存失败，请检查浏览器存储空间后重试"); }
            if (authEpoch === epoch) set({ user: null, wallet: null });
        } finally { if (authEpoch === epoch) set({ ready: true }); }
        const data = await apiRequest<{ user: AuthUser }>("/api/auth/login", { method: "POST", json: { email, password } });
        broadcastSessionChange();
        try { await hydrateNow(set); }
        catch (error) { throw new Error(`登录已提交，但会话确认失败：${error instanceof Error ? error.message : "请刷新页面"}`); }
        if (get().user?.id !== data.user.id) throw new Error("登录已提交，但会话未能确认，请刷新页面后重试");
        return data.user;
    }),

    register: (email, code, password, inviteCode) => authTransitions.write(async () => {
        authEpoch += 1;
        const epoch = authEpoch;
        set({ ready: false, sessionEpoch: authEpoch });
        try {
            try { await switchCachedAccount(null); }
            catch { throw new Error("本地数据保存失败，请检查浏览器存储空间后重试"); }
            if (authEpoch === epoch) set({ user: null, wallet: null });
        } finally { if (authEpoch === epoch) set({ ready: true }); }
        const data = await apiRequest<{ user: AuthUser }>("/api/auth/register", { method: "POST", json: { email, code, password, inviteCode: inviteCode || undefined } });
        broadcastSessionChange();
        try { await hydrateNow(set); }
        catch (error) { throw new Error(`注册已提交，请勿重复注册；会话确认失败：${error instanceof Error ? error.message : "请刷新页面后登录"}`); }
        if (get().user?.id !== data.user.id) throw new Error("注册已提交，但会话未能确认，请刷新页面后登录");
        return data.user;
    }),

    logout: () => authTransitions.write(async () => {
        const owner = get().user?.id;
        authEpoch += 1;
        const epoch = authEpoch;
        set({ ready: false, sessionEpoch: authEpoch });
        try {
            try { await switchCachedAccount(null); }
            catch { throw new Error("本地数据保存失败，尚未退出，请检查浏览器存储空间后重试"); }
            if (authEpoch !== epoch) return;
            if (authEpoch === epoch) set({ user: null, wallet: null });
            await apiRequest("/api/auth/logout", { method: "POST", headers: owner ? { "X-Sundas-User": owner } : undefined });
            broadcastSessionChange();
        } finally {
            if (authEpoch === epoch) set({ ready: true });
        }
    }),

    sendCode: async (email, purpose) => {
        await apiRequest("/api/auth/send-code", { method: "POST", json: { email, purpose } });
    },

    resetPassword: async (email, code, password) => {
        await apiRequest("/api/auth/reset-password", { method: "POST", json: { email, code, password } });
    },

    changePassword: async (oldPassword, newPassword, expectedUserId) => {
        await apiRequest("/api/auth/change-password", { method: "POST", headers: expectedUserId ? { "X-Sundas-User": expectedUserId } : undefined, json: { oldPassword, newPassword } });
    },
}));

useAuthStore.subscribe((state, previous) => {
    if (state.sessionEpoch !== previous.sessionEpoch || state.user?.id !== previous.user?.id) {
        clearSessionMediaCaches();
        useCanvasUiStore.getState().reset();
        useWorkbenchAgentStore.getState().reset();
    }
});
