import { useEffect } from "react";

const ACTIVE_CLASS = "scrollbar-active";
const HIDE_DELAY = 900;
const timers = new WeakMap<Element, number>();

export function useGlobalScrollbar() {
    useEffect(() => {
        const onScroll = (event: Event) => {
            const target = event.target;
            const element = target instanceof Element ? target : target === document ? document.scrollingElement : null;
            if (!element) return;
            element.classList.add(ACTIVE_CLASS);
            const previous = timers.get(element);
            if (previous) window.clearTimeout(previous);
            const timer = window.setTimeout(() => {
                element.classList.remove(ACTIVE_CLASS);
                timers.delete(element);
            }, HIDE_DELAY);
            timers.set(element, timer);
        };

        document.addEventListener("scroll", onScroll, true);
        return () => document.removeEventListener("scroll", onScroll, true);
    }, []);
}
