import { App } from "antd";
import { useEffect, useState } from "react";
import { useBlocker } from "react-router-dom";

// Keep the workbench mounted until selected media has finished uploading.
export function useReferenceTransfer() {
    const { message } = App.useApp();
    const [pending, setPending] = useState(0);
    const blocker = useBlocker(({ currentLocation, nextLocation }) => pending > 0 && currentLocation.pathname !== nextLocation.pathname);
    useEffect(() => {
        if (blocker.state !== "blocked") return;
        message.warning("参考素材正在处理，请等待完成后再切换页面");
        blocker.reset();
    }, [blocker, message]);

    const run = async <T,>(work: () => Promise<T>): Promise<T> => {
        setPending((value) => value + 1);
        try { return await work(); }
        finally { setPending((value) => value - 1); }
    };
    return { run, isTransferring: pending > 0 };
}
