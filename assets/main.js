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

// Twinkling pixel dust over the background flowers. Built here rather than in
// markup so one change reaches all 21 pages, and so the pages stay free of
// four dozen decorative empty elements. .px-field's mask does the real work:
// it clips every pixel to the motif, so the dust describes the flower.
function seedFlowerPixels() {
    const flowers = document.querySelectorAll('.bg-flower');
    if (!flowers.length) return;

    // Seeded, so the scatter is identical on every load and every page. A live
    // Math.random() layout occasionally clumps, and an unlucky one would ship
    // with nobody able to reproduce it.
    let seed = 0x9E3779B9;
    const rand = () => {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };

    flowers.forEach(flower => {
        const field = document.createElement('div');
        field.className = 'px-field';

        for (let i = 0; i < 64; i++) {
            // Polar placement keeps the dust out of the corners of the square
            // box, where no petal reaches and the mask would eat it anyway.
            const angle = rand() * Math.PI * 2;
            const radius = Math.sqrt(rand()) * 46;
            const size = 2 + Math.round(rand() * 2);
            const px = document.createElement('i');

            px.style.left = (50 + Math.cos(angle) * radius).toFixed(2) + '%';
            px.style.top = (50 + Math.sin(angle) * radius).toFixed(2) + '%';
            px.style.width = size + 'px';
            px.style.height = size + 'px';
            px.style.setProperty('--px-peak', (0.25 + rand() * 0.30).toFixed(3));
            px.style.setProperty('--px-dur', (2.6 + rand() * 3.8).toFixed(2) + 's');
            // A negative delay starts each pixel part-way through its cycle, so
            // they never blink in unison on the first pass.
            px.style.setProperty('--px-delay', '-' + (rand() * 10).toFixed(2) + 's');

            field.appendChild(px);
        }

        flower.appendChild(field);
    });
}

seedFlowerPixels();
