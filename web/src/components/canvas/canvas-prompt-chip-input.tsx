import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, MouseEvent, PointerEvent } from "react";
import { createPortal } from "react-dom";
import { Image } from "antd";
import { FileText, Image as ImageIcon, Music2, Video } from "lucide-react";

import i18n from "@/i18n";
import { canvasThemes } from "@/lib/canvas-theme";
import { isImeComposing, isSubmitEnterKey } from "@/lib/keyboard-event";
import { useThemeStore } from "@/stores/use-theme-store";
import type { CanvasResourceReference } from "@/lib/canvas/canvas-resource-references";

type Props = {
    value: string;
    references: CanvasResourceReference[];
    onChange: (value: string) => void;
    onSubmit?: () => void;
    className?: string;
    style?: CSSProperties;
    placeholder?: string;
    placeholderClassName?: string;
    chipMode?: "preview" | "label";
};

type MentionState = {
    query: string;
    rect: DOMRect | null;
};

type Token =
    | { type: "text"; value: string }
    | { type: "reference"; label: string };

// Prompt-panel contentEditable input: @ references embed thumbnail chips instead of plain label text.
// Serialization converts chips back to reference labels so the generated value matches the former textarea semantics.
export function CanvasPromptChipInput({ value, references, onChange, onSubmit, className, style, placeholder, placeholderClassName, chipMode = "preview" }: Props) {
    const themeName = useThemeStore((state) => state.theme);
    const theme = canvasThemes[themeName];
    const editorRef = useRef<HTMLDivElement>(null);
    const composingRef = useRef(false);
    // Track the last value emitted to the parent. An identical focused value is this component's own echo,
    // so skip rebuilding to preserve the caret and IME. Rebuild external changes even while focused.
    const lastEmittedRef = useRef(value);
    // Signature of the last content actually written into the DOM. Re-runs caused by unrelated parent renders
    // (generation polling, timers) must not touch the DOM: when focus briefly leaves the editor, rebuilding
    // here would write the stale `value` back and silently swallow whatever the user just pasted.
    const lastRenderedKeyRef = useRef("");
    const [mention, setMention] = useState<MentionState | null>(null);
    const [activeIndex, setActiveIndex] = useState(0);
    const [imagePreview, setImagePreview] = useState<string | null>(null);

    const activeReferences = useMemo(() => references.filter((item) => item.active), [references]);
    const referenceByLabel = useMemo(() => new Map(activeReferences.map((item) => [item.label, item])), [activeReferences]);
    // Match longer labels first so a shorter label cannot split a longer one.
    const activeLabels = useMemo(() => Array.from(new Set(activeReferences.map((item) => item.label))).sort((a, b) => b.length - a.length), [activeReferences]);
    const tokens = useMemo(() => parseTokens(value, activeLabels), [value, activeLabels]);

    const deferredMentionQuery = useDeferredValue(mention?.query ?? "");
    const candidates = useMemo(() => {
        if (!mention) return [];
        const query = deferredMentionQuery.trim().toLowerCase();
        if (!query) return activeReferences;
        return activeReferences.filter((item) => `${item.label} ${item.title} ${item.kind} ${item.text || ""}`.toLowerCase().includes(query));
    }, [mention, deferredMentionQuery, activeReferences]);

    // Rebuild the DOM only when the content that should be displayed actually changed (value / chips / theme),
    // never on plain re-renders. An identical focused value is this component's own echo, so keep the live DOM
    // untouched to preserve caret, IME state and freshly pasted text.
    const renderKey = `${value}\u0000${activeLabels.join("\u0001")}\u0000${chipMode}\u0000${themeName}`;
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor) return;
        if (lastRenderedKeyRef.current === renderKey) return;
        lastRenderedKeyRef.current = renderKey;
        if (document.activeElement === editor && value === lastEmittedRef.current) return;
        editor.textContent = "";
        tokens.forEach((token) => {
            if (token.type === "text") {
                editor.append(document.createTextNode(token.value));
                return;
            }
            const reference = referenceByLabel.get(token.label);
            if (reference) editor.append(createReferenceChip(reference, theme, setImagePreview, chipMode));
            else editor.append(document.createTextNode(token.label));
        });
        lastEmittedRef.current = value;
    }, [renderKey, tokens, referenceByLabel, theme, value, chipMode]);

    const emit = (next: string) => {
        lastEmittedRef.current = next;
        onChange(next);
    };

    const syncFromEditor = () => {
        const editor = editorRef.current;
        if (!editor) return;
        let next = serializeEditor(editor);
        // Chrome leaves an empty <br> behind after select-all + delete; it serializes to "\n" and shows up as
        // an extra blank line, so drop it and reset the caret to an empty editor.
        if (!next.trim() && !editor.textContent) {
            editor.textContent = "";
            placeCaretAtEnd(editor);
            next = "";
        }
        // Rich-text paste can bring nodes we cannot serialize (<style>, <img>, <meta>…). Falling back to
        // innerText keeps the text visible in the box and keeps the generate button enabled instead of
        // silently emitting an empty prompt.
        if (!next.trim() && editor.innerText.trim()) next = editor.innerText.replace(/\r\n?/g, "\n").replace(/\n$/, "");
        emit(next);
        syncMention();
    };

    const syncMention = () => {
        const text = textBeforeCaret();
        const match = /@([^\s@]*)$/.exec(text);
        if (!match || !activeReferences.length) {
            closeMention();
            return;
        }
        setMention({ query: match[1] || "", rect: caretRect() });
        setActiveIndex(0);
    };

    const closeMention = () => {
        setMention(null);
        setActiveIndex(0);
    };

    const insertReference = (reference: CanvasResourceReference) => {
        const editor = editorRef.current;
        if (!editor) return;
        removeActiveMention();
        const chip = createReferenceChip(reference, theme, setImagePreview, chipMode);
        const space = document.createTextNode(" ");
        const selection = window.getSelection();
        const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
        if (range) {
            range.insertNode(space);
            range.insertNode(chip);
            range.setStartAfter(space);
            range.collapse(true);
            selection?.removeAllRanges();
            selection?.addRange(range);
        } else {
            editor.append(chip, space);
            placeCaretAtEnd(editor);
        }
        closeMention();
        emit(serializeEditor(editor));
    };

    const showPlaceholder = !value.trim();

    return (
        <div className="relative w-full">
            {showPlaceholder && placeholder ? (
                <div className={`pointer-events-none absolute text-sm ${placeholderClassName || "left-3 top-2 leading-5"}`} style={{ color: theme.node.placeholder }}>
                    {placeholder}
                </div>
            ) : null}
            <div
                ref={editorRef}
                contentEditable
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                className={`${className || ""} overflow-y-auto whitespace-pre-wrap break-words outline-none`}
                style={{ ...style, cursor: "text" }}
                onInput={(event) => {
                    // Some IMEs (or a composition interrupted by the generate click) never fire compositionend,
                    // which would leave the flag stuck on true and drop every later input/paste. Trust the
                    // native event whenever it reports a finished composition.
                    if (composingRef.current && !(event.nativeEvent as InputEvent).isComposing) composingRef.current = false;
                    if (!composingRef.current) syncFromEditor();
                }}
                onPaste={(event) => {
                    const editor = editorRef.current;
                    if (!editor) return;
                    const text = event.clipboardData?.getData("text/plain") || "";
                    // Pure file/image clipboard keeps the browser default; anything with text is flattened to
                    // plain text so the prompt always round-trips through serializeEditor.
                    if (!text) return;
                    // Never let the browser drop rich HTML (style/meta/img nodes) into the editor: we insert the
                    // plain text ourselves and emit right away, so pasting always reaches the parent state even
                    // if the native input event is skipped.
                    event.preventDefault();
                    composingRef.current = false;
                    insertPlainText(editor, text);
                    // Defensive: if the DOM somehow ends up without any serializable text (dead selection,
                    // detached range…), write the clipboard text directly instead of emitting an empty prompt.
                    if (!serializeEditor(editor).trim()) {
                        editor.textContent = text;
                        placeCaretAtEnd(editor);
                    }
                    emit(serializeEditor(editor));
                    requestAnimationFrame(() => {
                        if (!composingRef.current) syncMention();
                    });
                }}
                onCompositionStart={() => {
                    composingRef.current = true;
                }}
                onCompositionEnd={() => {
                    composingRef.current = false;
                    syncFromEditor();
                }}
                onKeyDown={(event: KeyboardEvent<HTMLDivElement>) => {
                    // Keys are not swallowed here: the canvas shortcut handler already ignores events coming
                    // from editable targets, and blocking the bubble made Esc (close panel) and ⌘Z unusable.
                    if (isImeComposing(event)) return;
                    if (mention && candidates.length) {
                        if (event.key === "ArrowDown") {
                            event.preventDefault();
                            event.stopPropagation();
                            setActiveIndex((index) => (index + 1) % candidates.length);
                            return;
                        }
                        if (event.key === "ArrowUp") {
                            event.preventDefault();
                            event.stopPropagation();
                            setActiveIndex((index) => (index - 1 + candidates.length) % candidates.length);
                            return;
                        }
                        if (event.key === "Enter") {
                            event.preventDefault();
                            event.stopPropagation();
                            insertReference(candidates[Math.min(activeIndex, candidates.length - 1)]);
                            return;
                        }
                        if (event.key === "Escape") {
                            event.preventDefault();
                            event.stopPropagation();
                            closeMention();
                            return;
                        }
                    }
                    if ((event.key === "Backspace" || event.key === "Delete") && deleteAdjacentReference(event.key)) {
                        event.preventDefault();
                        event.stopPropagation();
                        syncFromEditor();
                        return;
                    }
                    if (isSubmitEnterKey(event) && onSubmit) {
                        event.preventDefault();
                        event.stopPropagation();
                        onSubmit();
                        return;
                    }
                    requestAnimationFrame(() => {
                        if (!composingRef.current) syncMention();
                    });
                }}
                onBlur={() => window.setTimeout(closeMention, 120)}
            />
            {mention && candidates.length ? (
                <MentionMenu rect={mention.rect} references={candidates} activeIndex={Math.min(activeIndex, candidates.length - 1)} theme={theme} onSelect={insertReference} />
            ) : null}
            {imagePreview ? <Image src={imagePreview} alt={i18n.t("canvas.composer.imagePreview")} style={{ display: "none" }} preview={{ visible: true, src: imagePreview, onVisibleChange: (visible) => !visible && setImagePreview(null) }} /> : null}
        </div>
    );
}

function MentionMenu({ rect, references, activeIndex, theme, onSelect }: { rect: DOMRect | null; references: CanvasResourceReference[]; activeIndex: number; theme: (typeof canvasThemes)[keyof typeof canvasThemes]; onSelect: (reference: CanvasResourceReference) => void }) {
    const selectedRef = useRef(false);
    const activeItemRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        activeItemRef.current?.scrollIntoView({ block: "nearest" });
    }, [activeIndex, references]);

    const selectReference = (reference: CanvasResourceReference) => {
        if (selectedRef.current) return;
        selectedRef.current = true;
        onSelect(reference);
    };

    const stopCanvasInteraction = (event: PointerEvent | MouseEvent) => event.stopPropagation();

    const menuWidth = 256;
    const maxMenuHeight = 224;
    const gap = 6;
    const anchor = rect || new DOMRect(16, 16, 0, 0);
    const left = clamp(anchor.left, 8, window.innerWidth - menuWidth - 8);
    const showAbove = anchor.bottom + gap + maxMenuHeight > window.innerHeight && anchor.top - gap - maxMenuHeight >= 0;
    const top = showAbove ? anchor.top - gap - maxMenuHeight : anchor.bottom + gap;

    return createPortal(
        <div
            data-canvas-resource-mention-menu="true"
            className="fixed z-[1100] max-h-56 w-64 overflow-y-auto rounded-xl border p-1 shadow-2xl backdrop-blur-md"
            style={{ left, top, background: theme.toolbar.panel, borderColor: theme.toolbar.border, color: theme.node.text }}
            onPointerDown={stopCanvasInteraction}
            onMouseDown={stopCanvasInteraction}
            onClick={(event) => event.stopPropagation()}
        >
            {references.map((reference, index) => (
                <button
                    key={reference.id}
                    ref={index === activeIndex ? activeItemRef : undefined}
                    type="button"
                    className="flex w-full min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition"
                    style={{ background: index === activeIndex ? theme.toolbar.activeBg : "transparent", color: index === activeIndex ? theme.toolbar.activeText : theme.node.text }}
                    onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                    onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        selectReference(reference);
                    }}
                >
                    <ReferencePreview reference={reference} />
                    <span className="min-w-0 flex-1">
                        <span className="block font-medium">{reference.label}</span>
                        <span className="block truncate opacity-65">{reference.text || reference.title}</span>
                    </span>
                </button>
            ))}
        </div>,
        document.body,
    );
}

function ReferencePreview({ reference }: { reference: CanvasResourceReference }) {
    if (reference.kind === "image" && reference.previewUrl) return <img src={reference.previewUrl} alt="" className="size-9 rounded-md object-cover" />;
    if (reference.kind === "video" && reference.previewUrl) return <video src={reference.previewUrl} className="size-9 rounded-md bg-black object-cover" muted preload="metadata" />;
    const Icon = reference.kind === "audio" ? Music2 : reference.kind === "video" ? Video : reference.kind === "image" ? ImageIcon : FileText;
    return (
        <span className="grid size-9 shrink-0 place-items-center rounded-md bg-black/10">
            <Icon className="size-4" />
        </span>
    );
}

function createReferenceChip(reference: CanvasResourceReference, theme: (typeof canvasThemes)[keyof typeof canvasThemes], onImagePreview: (url: string) => void, chipMode: "preview" | "label") {
    const wrapper = document.createElement("span");
    wrapper.contentEditable = "false";
    wrapper.dataset.refLabel = reference.label;
    if (chipMode === "label") {
        wrapper.className = "mx-px inline-flex h-6 max-w-40 items-center justify-center overflow-hidden rounded-md bg-[#d8ff3e]/16 px-1 text-xs leading-none align-middle text-[#d8ff3e]";
        wrapper.textContent = reference.label;
    } else if (reference.kind === "image" && reference.previewUrl) {
        const image = document.createElement("img");
        image.src = reference.previewUrl;
        image.alt = reference.title;
        image.className = "size-6 rounded object-cover";
        wrapper.className = "mx-px inline-flex size-6 items-center justify-center overflow-hidden rounded align-middle";
        wrapper.appendChild(image);
        wrapper.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            onImagePreview(reference.previewUrl || "");
        });
    } else {
        wrapper.className = "mx-px inline-flex h-6 max-w-40 items-center justify-center overflow-hidden rounded-md border px-1 text-xs leading-none align-middle";
        Object.assign(wrapper.style, { background: theme.toolbar.panel, borderColor: theme.node.stroke, color: theme.node.text } as CSSProperties);
        wrapper.title = reference.text || reference.title;
        const text = document.createElement("span");
        text.className = "block truncate";
        text.textContent = reference.kind === "text" ? reference.text || reference.title : reference.label;
        wrapper.appendChild(text);
    }
    return wrapper;
}

function serializeEditor(editor: HTMLElement) {
    return serializeNodes(editor.childNodes).replace(/﻿/g, "");
}

function serializeNodes(nodes: NodeListOf<ChildNode>) {
    let result = "";
    nodes.forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE) result += node.textContent || "";
        if (!(node instanceof HTMLElement)) return;
        const label = node.dataset.refLabel;
        if (label) result += label;
        else if (node.tagName === "BR") result += "\n";
        else result += serializeNodes(node.childNodes);
    });
    return result;
}

function removeActiveMention() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const text = textBeforeCaret();
    const match = /@([^\s@]*)$/.exec(text);
    if (!match) return;
    range.setStart(range.startContainer, Math.max(0, range.startOffset - (match[1] || "").length - 1));
    range.deleteContents();
}

// Chips are atomic contentEditable="false" blocks and are removed as a unit with adjacent Backspace/Delete presses.
function deleteAdjacentReference(key: string) {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.isCollapsed) return false;
    const range = selection.getRangeAt(0);
    const target = adjacentReferenceNode(range, key);
    if (!target) return false;
    const nextCaretNode = document.createTextNode("");
    target.replaceWith(nextCaretNode);
    range.setStart(nextCaretNode, 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
}

function adjacentReferenceNode(range: Range, key: string) {
    const container = range.startContainer;
    const offset = range.startOffset;
    const previous = key === "Backspace";
    if (container.nodeType === Node.TEXT_NODE) {
        const text = container.textContent || "";
        if ((previous && offset > 0) || (!previous && offset < text.length)) return null;
        return findReferenceSibling(container, previous);
    }
    const children = Array.from(container.childNodes);
    return findReferenceSibling(children[previous ? offset - 1 : offset] || container, previous, true);
}

function findReferenceSibling(node: Node, previous: boolean, includeSelf = false): HTMLElement | null {
    let current: Node | null = includeSelf ? node : previous ? node.previousSibling : node.nextSibling;
    while (current && current.nodeType === Node.TEXT_NODE && !(current.textContent || "").trim()) current = previous ? current.previousSibling : current.nextSibling;
    return current instanceof HTMLElement && current.dataset.refLabel ? current : null;
}

function textBeforeCaret() {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return "";
    const range = selection.getRangeAt(0).cloneRange();
    const editor = closestEditor(range.startContainer);
    if (!editor) return "";
    range.setStart(editor, 0);
    return range.toString();
}

function caretRect(): DOMRect | null {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return null;
    const range = selection.getRangeAt(0).cloneRange();
    range.collapse(true);
    const rect = range.getBoundingClientRect();
    if (rect.width || rect.height || rect.left || rect.top) return rect;
    // Empty lines and editors produce a zero-sized range, so fall back to the editor bounds.
    const editor = closestEditor(range.startContainer);
    return editor ? editor.getBoundingClientRect() : null;
}

function closestEditor(node: Node) {
    const element = node instanceof Element ? node : node.parentElement;
    return element?.closest("[contenteditable='true']") || null;
}

function placeCaretAtEnd(element: HTMLElement) {
    const range = document.createRange();
    range.selectNodeContents(element);
    range.collapse(false);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
}

// Insert clipboard text as plain text nodes (newlines become <br> so serializeNodes can round-trip them),
// replacing the current selection and leaving the caret right after the pasted block.
function insertPlainText(editor: HTMLElement, text: string) {
    const selection = window.getSelection();
    let range: Range | null = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!range || !editor.contains(range.commonAncestorContainer)) {
        range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
    }
    range.deleteContents();
    const fragment = document.createDocumentFragment();
    text.replace(/\r\n?/g, "\n").split("\n").forEach((line, index) => {
        if (index > 0) fragment.append(document.createElement("br"));
        if (line) fragment.append(document.createTextNode(line));
    });
    const last = fragment.lastChild;
    range.insertNode(fragment);
    if (!last) return;
    const caret = document.createRange();
    caret.setStartAfter(last);
    caret.collapse(true);
    selection?.removeAllRanges();
    selection?.addRange(caret);
}

// Split value into text fragments and matching active labels, which are already sorted by descending length.
function parseTokens(value: string, labels: string[]): Token[] {
    if (!labels.length) return value ? [{ type: "text", value }] : [];
    const escaped = labels.map(escapeRegExp).join("|");
    const pattern = new RegExp(`(${escaped})`, "g");
    const tokens: Token[] = [];
    let lastIndex = 0;
    for (const match of value.matchAll(pattern)) {
        if (match.index === undefined) continue;
        if (match.index > lastIndex) tokens.push({ type: "text", value: value.slice(lastIndex, match.index) });
        tokens.push({ type: "reference", label: match[0] });
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < value.length) tokens.push({ type: "text", value: value.slice(lastIndex) });
    return tokens;
}

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function clamp(value: number, min: number, max: number) {
    if (max < min) return min;
    return Math.min(Math.max(value, min), max);
}
