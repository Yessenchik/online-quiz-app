document.addEventListener('DOMContentLoaded', () => {
    let path = location.pathname.replace(/\/+$/, '');
    if (path === '') path = '/';

    document.querySelectorAll('[data-nav]').forEach((a) => {
        const href = a.getAttribute('href');

        // Mark active if it matches current path
        // Also treat "/" and "/main" as the same homepage
        const isRootMatch = (path === '/' && (href === '/' || href === '/main'));
        if (href === path || isRootMatch) {
            a.classList.add('active');
        }
    });
});