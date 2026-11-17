export function initHomePageEnhancements(root: HTMLElement) {
    const observed = new WeakSet<Element>();
    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            observer.unobserve(entry.target);
        }
    }, { threshold: 0.1 });
    const observeCards = () => root.querySelectorAll('.home-section, .home-prompt-card').forEach(element => {
        if (!observed.has(element)) { observed.add(element); observer.observe(element); }
    });
    const move = (event: MouseEvent) => {
        const card = event.target instanceof Element ? event.target.closest<HTMLElement>('.home-prompt-card') : null;
        if (!card || !root.contains(card)) return;
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        card.style.setProperty('--mouse-x', `${(event.clientX - rect.left) / rect.width * 100}%`);
        card.style.setProperty('--mouse-y', `${(event.clientY - rect.top) / rect.height * 100}%`);
    };
    const animations = new Set<Animation>();
    const click = (event: MouseEvent) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        const button = event.target instanceof Element ? event.target.closest<HTMLElement>('.home-submit, .home-mode, .home-prompt-tab') : null;
        if (!button || !root.contains(button)) return;
        const animation = button.animate([{ transform: 'scale(0.95)' }, { transform: 'scale(1)' }], { duration: 150 });
        animations.add(animation);
        animation.finished.then(() => animations.delete(animation), () => animations.delete(animation));
    };
    const mutations = new MutationObserver(observeCards);
    observeCards();
    mutations.observe(root, { childList: true, subtree: true });
    root.addEventListener('mousemove', move);
    root.addEventListener('click', click);
    return () => {
        observer.disconnect(); mutations.disconnect();
        root.removeEventListener('mousemove', move); root.removeEventListener('click', click);
        animations.forEach(animation => animation.cancel());
    };
}
