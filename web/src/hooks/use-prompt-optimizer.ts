import { useCallback, useEffect, useRef, useState } from "react";

import { optimizePrompt, type PromptOptimizerCapability, type PromptOptimizerResult } from "@/services/api/prompt-optimizer";

type OptimizeInput = {
    prompt: string;
    model: string;
    capability: PromptOptimizerCapability;
};

export function usePromptOptimizer() {
    const [optimizing, setOptimizing] = useState(false);
    const controllerRef = useRef<AbortController | null>(null);

    const cancel = useCallback(() => {
        if (!controllerRef.current) return;
        controllerRef.current.abort();
        controllerRef.current = null;
        setOptimizing(false);
    }, []);

    const optimize = useCallback(async (input: OptimizeInput): Promise<PromptOptimizerResult> => {
        controllerRef.current?.abort();
        const controller = new AbortController();
        controllerRef.current = controller;
        setOptimizing(true);
        try {
            return await optimizePrompt(input, controller.signal);
        } finally {
            if (controllerRef.current === controller) {
                controllerRef.current = null;
                setOptimizing(false);
            }
        }
    }, []);

    useEffect(() => () => {
        controllerRef.current?.abort();
    }, []);

    return { optimize, optimizing, cancel };
}
