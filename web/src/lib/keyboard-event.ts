type NativeKeyboardEventLike = {
    isComposing?: boolean;
    keyCode?: number;
    which?: number;
};

type KeyboardEventLike = NativeKeyboardEventLike & {
    key?: string;
    shiftKey?: boolean;
    ctrlKey?: boolean;
    metaKey?: boolean;
    altKey?: boolean;
    nativeEvent?: NativeKeyboardEventLike;
};

export function isImeComposing(event: KeyboardEventLike) {
    const nativeEvent = event.nativeEvent;
    return Boolean(event.isComposing || nativeEvent?.isComposing || event.keyCode === 229 || event.which === 229 || nativeEvent?.keyCode === 229 || nativeEvent?.which === 229);
}

export function isPlainEnterKey(event: KeyboardEventLike) {
    return event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !isImeComposing(event);
}

/** Ctrl/Cmd+Enter submits; a plain Enter stays available for a new line. */
export function isSubmitEnterKey(event: KeyboardEventLike) {
    return event.key === "Enter" && Boolean(event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && !isImeComposing(event);
}

export function isEditableElement(target: EventTarget | null): boolean {
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
    if (!(target instanceof Element)) return false;
    return Boolean(target.closest("[contenteditable='true'], input, textarea, select"));
}
