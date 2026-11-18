export function creationStatus(status: "success" | "pending" | "failed" | "unavailable") {
    return { success: "已完成", pending: "生成中", failed: "失败", unavailable: "结果暂不可用" }[status];
}
