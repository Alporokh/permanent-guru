// Consent: GA4 runs in Google Consent Mode v2. The <head> of every page sets
// all four signals to denied before anything loads, so no cookie is written
// until the visitor accepts; Microsoft Clarity is not loaded at all until then.
function getConsent() {
    try { return localStorage.getItem('cookie-consent'); } catch { return null; }
}

// One accept/reject moves all four signals together. A partial update would
// leave the ad_* signals on their denied default and misreport the choice.
function updateConsent(choice) {
    const state = choice === 'accepted' ? 'granted' : 'denied';
    gtag('consent', 'update', {
        ad_storage: state,
        ad_user_data: state,
        ad_personalization: state,
        analytics_storage: state,
    });
}

// Defer Google tag + Microsoft Clarity until idle/interaction — both are heavy
// enough on the main thread to blow up Total Blocking Time if loaded eagerly.
function loadAnalytics() {
    if (window.__analyticsLoaded) return;
    window.__analyticsLoaded = true;

    // The inline <head> script owns dataLayer, gtag and the denied defaults.
    // Only fall back to defining them if that script somehow did not run - a
    // second 'default' call here would override the real one.
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { dataLayer.push(arguments); };

    // Replay a choice made on an earlier visit. That visitor never sees the
    // banner again, so without this their consent would stay denied forever.
    const stored = getConsent();
    if (stored) updateConsent(stored);

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
    // Where on the page the link sits. Checked from most specific outwards,
    // so the same number in the header, the closing strip and the contact
    // card can be told apart in GA4 rather than all reporting "page".
    const placement =
        (link.classList.contains('wa-float') && 'floating_button') ||
        (link.closest('footer') && 'footer') ||
        (link.closest('.mobile-nav') && 'mobile_nav') ||
        (link.closest('.site-nav') && 'nav') ||
        (link.closest('.cta-strip') && 'cta_strip') ||
        (link.closest('.hero, .page-hero') && 'hero') ||
        (link.closest('.contact-grid') && 'contact_card') ||
        link.closest('[id]')?.id || 'page';

    if (href.startsWith('tel:')) {
        trackEvent('phone_click', { link_placement: placement });
    } else if (href.startsWith('mailto:')) {
        trackEvent('email_click', { link_placement: placement });
    } else if (link.hostname.endsWith('booksy.com')) {
        const utmContent = new URL(link.href).searchParams.get('utm_content');
        trackEvent('booksy_click', { link_placement: utmContent || placement });
    } else if (link.hostname.endsWith('instagram.com')) {
        trackEvent('instagram_click', { link_placement: placement, link_url: link.href });
    } else if (link.hostname.endsWith('wa.me') || link.hostname.endsWith('whatsapp.com')) {
        trackEvent('whatsapp_click', { link_placement: placement, link_url: link.href });
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
    updateConsent(choice);
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
        // the class is what the WhatsApp button's CSS watches, so it has to be
        // set here too - display:none alone leaves the button pushed upwards
        cookieBanner.classList.add('cookie-hidden');
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

// Snapshot trail: a cursor trail of photographs across the portfolio band.
// Each print is thrown in at an angle, overshoots, settles flat, then fades.
//
// The prints reuse the files already in the markup, so nothing extra is
// fetched, and the resting pile underneath is what a phone or a visitor
// without JS sees - this is only an enhancement on top of it.
function snapshotTrail() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.querySelectorAll('[data-snapshot-trail]').forEach(area => {
        const sources = Array.from(area.querySelectorAll('.trail-source img'));
        if (!sources.length) return;

        // Spawn by distance travelled rather than per event: a mouse fires
        // hundreds of moves a second, and one print each would bury the band.
        const STEP = 94;
        const MAX_LIVE = 9;
        const live = [];
        let next = 0;
        let lastX = null;
        let lastY = null;
        let travelled = 0;

        const spread = amount => ((Math.random() * 2) - 1) * amount;

        function drop(x, y) {
            const source = sources[next % sources.length];
            next += 1;

            const print = document.createElement('div');
            print.className = 'trail-print';
            print.style.left = x + 'px';
            print.style.top = y + 'px';
            print.style.setProperty('--r', spread(12).toFixed(2) + 'deg');
            print.style.setProperty('--r0', spread(26).toFixed(2) + 'deg');
            print.style.setProperty('--r1', spread(7).toFixed(2) + 'deg');

            const img = document.createElement('img');
            img.src = source.currentSrc || source.src;
            img.alt = '';
            img.setAttribute('aria-hidden', 'true');
            print.appendChild(img);

            area.appendChild(print);
            live.push(print);
            while (live.length > MAX_LIVE) live.shift().remove();

            print.addEventListener('animationend', () => {
                const at = live.indexOf(print);
                if (at > -1) live.splice(at, 1);
                print.remove();
            });
        }

        area.addEventListener('pointermove', event => {
            if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;

            const box = area.getBoundingClientRect();
            const x = event.clientX - box.left;
            const y = event.clientY - box.top;

            if (lastX !== null) travelled += Math.hypot(x - lastX, y - lastY);
            lastX = x;
            lastY = y;

            if (travelled < STEP) return;
            travelled = 0;
            area.classList.add('is-live');
            drop(x, y);
        });

        // Re-entering elsewhere should not count the jump as travel.
        area.addEventListener('pointerleave', () => {
            lastX = null;
            lastY = null;
            travelled = 0;
        });
    });
}

snapshotTrail();
