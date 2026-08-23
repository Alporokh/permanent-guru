// Defer Google tag + Microsoft Clarity until idle/interaction — both are heavy
// enough on the main thread to blow up Total Blocking Time if loaded eagerly.
function loadAnalytics() {
    if (window.__analyticsLoaded) return;
    window.__analyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('js', new Date());
    gtag('config', 'G-0RBEJ7QR9N');

    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-0RBEJ7QR9N';
    document.head.appendChild(gtagScript);

    (function (c, l, a, r, i, t, y) {
        c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
        t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
        y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
    })(window, document, 'clarity', 'script', 'x7eqf9ruad');
}

if ('requestIdleCallback' in window) {
    requestIdleCallback(loadAnalytics, { timeout: 4000 });
} else {
    setTimeout(loadAnalytics, 3000);
}
['scroll', 'keydown', 'click', 'touchstart'].forEach(evt =>
    window.addEventListener(evt, loadAnalytics, { once: true, passive: true })
);

const burger = document.querySelector('.burger');
const mobileNav = document.getElementById('mobile-nav');

if (burger && mobileNav) {
    burger.addEventListener('click', () => {
        const isOpen = mobileNav.classList.toggle('open');
        burger.setAttribute('aria-expanded', isOpen);
        mobileNav.setAttribute('aria-hidden', !isOpen);
        document.body.style.overflow = isOpen ? 'hidden' : '';
    });

    mobileNav.querySelectorAll('a').forEach(link => {
        link.addEventListener('click', () => {
            mobileNav.classList.remove('open');
            burger.setAttribute('aria-expanded', 'false');
            mobileNav.setAttribute('aria-hidden', 'true');
            document.body.style.overflow = '';
        });
    });
}

// RODO checkbox validation — runs before the inline Formspree handler
const contactForm = document.getElementById('contact-form');
if (contactForm) {
    const rodoField = contactForm.querySelector('#rodo');
    if (rodoField) {
        contactForm.addEventListener('submit', function (e) {
            if (!rodoField.checked) {
                e.preventDefault();
                e.stopImmediatePropagation();
                rodoField.closest('.field-rodo').classList.add('rodo-error');
                rodoField.focus();
            }
        });
        rodoField.addEventListener('change', function () {
            if (this.checked) this.closest('.field-rodo').classList.remove('rodo-error');
        });
    }
}

// Cookie consent banner
const cookieBanner = document.getElementById('cookie-banner');
if (cookieBanner) {
    if (localStorage.getItem('cookie-consent')) {
        cookieBanner.style.display = 'none';
    }

    document.getElementById('cookie-accept')?.addEventListener('click', () => {
        localStorage.setItem('cookie-consent', 'accepted');
        cookieBanner.classList.add('cookie-hidden');
    });

    document.getElementById('cookie-decline')?.addEventListener('click', () => {
        localStorage.setItem('cookie-consent', 'declined');
        cookieBanner.classList.add('cookie-hidden');
    });
}
