/**
 * 客户端诊断（sundas 精简版）。
 *
 * BeefTV 有一套带本地事件存储、上传与去重的诊断管道；sundas 还没有对应后端，
 * 这里保留 recordDiagnosticEvent 的签名，开发环境落到 console，生产环境静默丢弃。
 * 目的只有一个：让从 BeefTV 平移过来的调用点保持可编译、可观测、且不引入新后端依赖。
 */
export type DiagnosticEventInput = {
    level: "info" | "warning" | "error";
    category?: string;
    code?: string;
    message: string;
    detail?: Record<string, unknown>;
    timestamp?: string;
};

export function recordDiagnosticEvent(input: DiagnosticEventInput) {
    if (!import.meta.env.DEV) return;
    const line = `[diagnostic:${input.level}] ${input.code || input.category || "runtime"} — ${input.message}`;
    if (input.level === "error") console.warn(line, input.detail ?? "");
    else console.info(line, input.detail ?? "");
}
