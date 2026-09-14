// Consent: GA4 runs in Google Consent Mode v2. Until the visitor accepts
// cookies, analytics_storage stays denied (no GA cookies are written) and
// Microsoft Clarity is not loaded at all.
function getConsent() {
    try { return localStorage.getItem('cookie-consent'); } catch { return null; }
}

// Defer Google tag + Microsoft Clarity until idle/interaction — both are heavy
// enough on the main thread to blow up Total Blocking Time if loaded eagerly.
function loadAnalytics() {
    if (window.__analyticsLoaded) return;
    window.__analyticsLoaded = true;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { dataLayer.push(arguments); };
    gtag('consent', 'default', {
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
        analytics_storage: getConsent() === 'accepted' ? 'granted' : 'denied',
    });
    gtag('js', new Date());
    gtag('config', 'G-0RBEJ7QR9N');

    const gtagScript = document.createElement('script');
    gtagScript.async = true;
    gtagScript.src = 'https://www.googletagmanager.com/gtag/js?id=G-0RBEJ7QR9N';
    document.head.appendChild(gtagScript);

    if (getConsent() === 'accepted') loadClarity();
}

function loadClarity() {
    if (window.__clarityLoaded) return;
    window.__clarityLoaded = true;

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

// Lead tracking — GA4 events for form enquiries and contact clicks.
// loadAnalytics() defines gtag synchronously, so an event sent before the
// deferred tag has loaded is queued in dataLayer instead of being lost.
function trackEvent(name, params) {
    loadAnalytics();
    gtag('event', name, params);
}
window.trackEvent = trackEvent;

document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href]');
    if (!link) return;
    const href = link.getAttribute('href');
    const placement = link.closest('[id]')?.id || 'page';

    if (href.startsWith('tel:')) {
        trackEvent('phone_click', { link_placement: placement });
    } else if (href.startsWith('mailto:')) {
        trackEvent('email_click', { link_placement: placement });
    } else if (link.hostname.endsWith('booksy.com')) {
        const utmContent = new URL(link.href).searchParams.get('utm_content');
        trackEvent('booksy_click', { link_placement: utmContent || placement });
    } else if (link.hostname.endsWith('instagram.com')) {
        trackEvent('instagram_click', { link_placement: placement, link_url: link.href });
    }
});

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

// RODO checkbox validation — runs before the inline form handler
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

function clearAnalyticsCookies() {
    const host = location.hostname.replace(/^www\./, '');
    document.cookie.split(';')
        .map(c => c.split('=')[0].trim())
        .filter(name => /^(_ga|_gid|_gat|_clck|_clsk)/.test(name))
        .forEach(name => {
            ['', host, '.' + host].forEach(domain => {
                document.cookie = name + '=; Max-Age=0; path=/' + (domain ? '; domain=' + domain : '');
            });
        });
}

function setConsent(choice) {
    try { localStorage.setItem('cookie-consent', choice); } catch {}
    loadAnalytics();
    gtag('consent', 'update', { analytics_storage: choice === 'accepted' ? 'granted' : 'denied' });
    cookieBanner?.classList.add('cookie-hidden');

    if (choice === 'accepted') {
        loadClarity();
    } else {
        clearAnalyticsCookies();
        // Clarity can't be stopped once running; a reload starts the page without it
        if (window.__clarityLoaded) location.reload();
    }
}

if (cookieBanner) {
    if (getConsent()) {
        cookieBanner.style.display = 'none';
    }
    document.getElementById('cookie-accept')?.addEventListener('click', () => setConsent('accepted'));
    document.getElementById('cookie-decline')?.addEventListener('click', () => setConsent('declined'));
}

// Links to #ustawienia-cookie reopen the banner so visitors can change their choice
document.addEventListener('click', (e) => {
    if (!cookieBanner || !e.target.closest('a[href$="#ustawienia-cookie"]')) return;
    e.preventDefault();
    cookieBanner.style.display = '';
    cookieBanner.classList.remove('cookie-hidden');
});
