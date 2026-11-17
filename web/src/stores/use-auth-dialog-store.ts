import { create } from "zustand";

export type AuthMode = "login" | "register" | "reset";

type OpenOptions = {
    /** 登录成功后的落点，默认回首页 */
    redirect?: string;
    /** 邀请码，注册入口带过来时预填 */
    invite?: string;
};

type AuthDialogState = {
    mode: AuthMode | null;
    redirect: string;
    invite: string;
    open: (mode?: AuthMode, options?: OpenOptions) => void;
    setMode: (mode: AuthMode) => void;
    close: () => void;
};

/**
 * 登录弹窗状态：任意页面调用 open() 即可浮出，不改变当前路由。
 * /login /register /forgot-password 三个地址仍可用，由 AuthGate 落到首页后自动弹窗。
 */
export const useAuthDialogStore = create<AuthDialogState>((set) => ({
    mode: null,
    redirect: "/",
    invite: "",
    open: (mode = "login", options) =>
        set({ mode, redirect: options?.redirect ?? "/", invite: options?.invite ?? "" }),
    setMode: (mode) => set({ mode }),
    close: () => set({ mode: null }),
}));
