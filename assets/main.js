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
        (link.closest('.action-bar') && 'action_bar') ||
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
        let lastPointerAt = -Infinity;

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

            lastPointerAt = event.timeStamp;
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

        // A finger has no hover, so on a touch screen the scroll itself drives
        // the trail: prints drop as the band travels through the viewport, and
        // where they land follows how far through it has got. Costs nothing
        // when the page is still, and nothing at all while the band is off
        // screen.
        const SCROLL_STEP = 68;
        let onScreen = false;
        let lastScrollY = window.scrollY;
        let scrolled = 0;
        let queued = false;

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(entries => {
                onScreen = entries.some(entry => entry.isIntersecting);
            }).observe(area);
        } else {
            onScreen = true;
        }

        window.addEventListener('scroll', () => {
            const dy = Math.abs(window.scrollY - lastScrollY);
            lastScrollY = window.scrollY;
            if (!onScreen || queued) return;

            // While a real cursor is working the band, let it have the floor -
            // otherwise a scroll with the mouse over it spawns from both.
            if (performance.now() - lastPointerAt < 500) return;

            scrolled += dy;
            if (scrolled < SCROLL_STEP) return;
            scrolled = 0;

            // One rect read per frame, after the scroll has settled.
            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                const box = area.getBoundingClientRect();
                if (!box.height) return;

                // 0 as the band enters from the bottom, 1 as it leaves the top.
                const through = 1 - (box.top + box.height) / (window.innerHeight + box.height);
                const wander = Math.sin(through * Math.PI * 2.4);
                const drift = Math.sin(through * Math.PI * 3.7 + 1.1);

                area.classList.add('is-live');
                drop(box.width * (0.5 + 0.34 * wander),
                     box.height * (0.5 + 0.22 * drift));
            });
        }, { passive: true });
    });
}

snapshotTrail();

// Portfolio carousel. JS only decides which photo is active and how far each
// other one sits from it; the look is entirely in style.css, driven by two
// custom properties per item.
//
// Distance is measured around the ring, not along the list, so the strip has
// no ends - photo 1 sits next to photo 13 and the arrows never dead-end.
function coverflow() {
    const NEIGHBOURS = 3; // how many are drawn either side of the active one

    document.querySelectorAll('[data-coverflow]').forEach(root => {
        const items = Array.from(root.querySelectorAll('.cf-item'));
        const count = items.length;
        if (!count) return;

        let active = Math.floor(count / 2);

        function layout() {
            items.forEach((item, index) => {
                let offset = index - active;
                if (offset > count / 2) offset -= count;
                if (offset < -count / 2) offset += count;

                const distance = Math.abs(offset);
                const far = distance > NEIGHBOURS;

                item.style.setProperty('--o', offset);
                item.style.setProperty('--abs', Math.min(distance, NEIGHBOURS + 1));
                item.toggleAttribute('data-far', far);
                item.toggleAttribute('data-active', offset === 0);
                // Only the photo in front is worth announcing.
                item.setAttribute('aria-hidden', offset === 0 ? 'false' : 'true');
            });
        }

        function go(to) {
            active = ((to % count) + count) % count;
            layout();
        }

        root.querySelector('.cf-prev').addEventListener('click', () => go(active - 1));
        root.querySelector('.cf-next').addEventListener('click', () => go(active + 1));
        items.forEach((item, index) => {
            item.addEventListener('click', () => {
                if (index !== active) go(index);
            });
        });

        // Swipe, and click-drag with a mouse. Horizontal only - the vertical
        // axis stays with the page, which touch-action: pan-y enforces.
        let startX = null;
        let startY = null;

        root.addEventListener('pointerdown', event => {
            startX = event.clientX;
            startY = event.clientY;
        });

        root.addEventListener('pointerup', event => {
            if (startX === null) return;
            const dx = event.clientX - startX;
            const dy = event.clientY - startY;
            startX = null;
            if (Math.abs(dx) < 42 || Math.abs(dx) < Math.abs(dy)) return;
            go(active + (dx < 0 ? 1 : -1));
        });

        root.addEventListener('pointercancel', () => { startX = null; });

        root.tabIndex = 0;
        root.addEventListener('keydown', event => {
            if (event.key === 'ArrowLeft') {
                event.preventDefault();
                go(active - 1);
            } else if (event.key === 'ArrowRight') {
                event.preventDefault();
                go(active + 1);
            }
        });

        layout();
    });
}

coverflow();

// Glass cursor over the tattoo photo. A second, enlarged copy of the same
// image rides inside a round window, offset so whatever sits under the
// cursor lands at the lens centre - magnification is the bend. All CSS does
// is make it look like glass; the offset arithmetic is here.
//
// Nothing is built until the pointer first arrives, and nothing happens on a
// touch screen, where there is no cursor to carry a lens.
function glassCursor() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    document.querySelectorAll('[data-glass]').forEach(host => {
        const photo = host.querySelector('img');
        if (!photo) return;

        const ZOOM = 1.9;
        let lens = null;
        let inner = null;
        let radius = 0;

        function build() {
            if (lens) return;
            lens = document.createElement('div');
            lens.className = 'glass-lens';
            lens.setAttribute('aria-hidden', 'true');
            inner = document.createElement('img');
            inner.src = photo.currentSrc || photo.src;
            inner.alt = '';
            lens.appendChild(inner);
            host.appendChild(lens);
        }

        function size() {
            const box = host.getBoundingClientRect();
            // A lens proportional to the photo, so it holds up at any width.
            radius = Math.max(52, Math.min(box.width, box.height) * 0.22);
            lens.style.width = radius * 2 + 'px';
            lens.style.height = radius * 2 + 'px';
            inner.style.width = box.width * ZOOM + 'px';
            inner.style.height = box.height * ZOOM + 'px';
            return box;
        }

        host.addEventListener('pointerenter', event => {
            if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
            build();
            size();
            lens.classList.add('is-on');
        });

        host.addEventListener('pointermove', event => {
            if (!lens) return;
            const box = size();
            const x = event.clientX - box.left;
            const y = event.clientY - box.top;

            lens.style.transform = 'translate(' + (x - radius) + 'px,' + (y - radius) + 'px)';
            // Pull the enlarged copy back by the zoomed cursor position, then
            // push it out by the radius: the sampled point ends up centred.
            inner.style.left = (radius - x * ZOOM) + 'px';
            inner.style.top = (radius - y * ZOOM) + 'px';
        });

        host.addEventListener('pointerleave', () => {
            if (lens) lens.classList.remove('is-on');
        });
    });
}

// Confetti cursor over the testimonials: paper spills from the pointer as it
// moves and bursts on click. Canvas rather than elements - a burst is fifty
// pieces, and fifty nodes with their own animations is a worse trade.
//
// The loop runs only while paper is in the air and stops itself when the last
// piece lands, so an untouched section costs nothing.
function confettiCursor() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const COLOURS = ['#971756', '#C66B92', '#6E0F3E', '#E2A9C0', '#2A171F'];

    document.querySelectorAll('[data-confetti]').forEach(host => {
        if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

        const canvas = document.createElement('canvas');
        canvas.className = 'confetti-canvas';
        canvas.setAttribute('aria-hidden', 'true');
        host.appendChild(canvas);

        const ctx = canvas.getContext('2d');
        const pieces = [];
        let running = false;
        let dpr = 1;
        let lastX = null;
        let lastY = null;
        let travelled = 0;

        function resize() {
            const box = host.getBoundingClientRect();
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.max(1, Math.round(box.width * dpr));
            canvas.height = Math.max(1, Math.round(box.height * dpr));
            return box;
        }

        function add(x, y, force) {
            const angle = Math.random() * Math.PI * 2;
            const speed = force * (0.6 + Math.random() * 0.9);
            pieces.push({
                x: x, y: y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - force * 0.5,
                w: 5 + Math.random() * 7,
                h: 2 + Math.random() * 5,
                spin: (Math.random() * 2 - 1) * 0.22,
                angle: Math.random() * Math.PI,
                // the phase of the end-over-end flip
                flip: Math.random() * Math.PI * 2,
                flipRate: 0.1 + Math.random() * 0.16,
                colour: COLOURS[(Math.random() * COLOURS.length) | 0],
                round: Math.random() < 0.22,
                life: 1
            });
        }

        function frame() {
            if (!running) return;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);

            for (let i = pieces.length - 1; i >= 0; i--) {
                const p = pieces[i];
                p.vy += 0.17;          // gravity
                p.vx *= 0.992;         // air
                p.vy *= 0.992;
                p.x += p.vx;
                p.y += p.vy;
                p.angle += p.spin;
                p.flip += p.flipRate;
                p.life -= 0.0075;

                if (p.life <= 0 || p.y - 40 > canvas.height / dpr) {
                    pieces.splice(i, 1);
                    continue;
                }

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate(p.angle);
                // Squeezing the width is the tumble: side on, the paper
                // disappears to a line, exactly as a real piece would.
                ctx.scale(Math.cos(p.flip), 1);
                ctx.globalAlpha = Math.max(0, Math.min(1, p.life));
                ctx.fillStyle = p.colour;
                if (p.round) {
                    ctx.beginPath();
                    ctx.ellipse(0, 0, p.w / 2, p.h / 2, 0, 0, Math.PI * 2);
                    ctx.fill();
                } else {
                    ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
                }
                ctx.restore();
            }

            if (!pieces.length) {
                running = false;
                return;
            }
            requestAnimationFrame(frame);
        }

        function start() {
            if (running) return;
            running = true;
            requestAnimationFrame(frame);
        }

        host.addEventListener('pointermove', event => {
            const box = resize();
            const x = event.clientX - box.left;
            const y = event.clientY - box.top;

            if (lastX !== null) travelled += Math.hypot(x - lastX, y - lastY);
            lastX = x;
            lastY = y;
            if (travelled < 26) return;
            travelled = 0;

            add(x, y, 1.6);
            if (Math.random() < 0.5) add(x, y, 1.6);
            start();
        });

        host.addEventListener('pointerleave', () => {
            lastX = null;
            lastY = null;
            travelled = 0;
        });

        host.addEventListener('click', event => {
            const box = resize();
            const x = event.clientX - box.left;
            const y = event.clientY - box.top;
            for (let i = 0; i < 46; i++) add(x, y, 5.2);
            start();
        });

        // A finger has no hover, so scrolling spills the paper too: a little
        // falls from the top of the section as it travels up the screen. Same
        // discipline as the photo trail - gated on being visible, one rect
        // read per frame, passive listener, and nothing at all when still.
        let onScreen = false;
        let lastScrollY = window.scrollY;
        let scrolled = 0;
        let queued = false;

        if ('IntersectionObserver' in window) {
            new IntersectionObserver(entries => {
                onScreen = entries.some(entry => entry.isIntersecting);
            }).observe(host);
        } else {
            onScreen = true;
        }

        window.addEventListener('scroll', () => {
            const dy = Math.abs(window.scrollY - lastScrollY);
            lastScrollY = window.scrollY;
            if (!onScreen || queued) return;

            scrolled += dy;
            if (scrolled < 90) return;
            scrolled = 0;

            queued = true;
            requestAnimationFrame(() => {
                queued = false;
                const box = host.getBoundingClientRect();
                if (!box.height) return;

                // wander across the width as the section passes through
                const through = 1 - (box.top + box.height) / (window.innerHeight + box.height);
                const across = 0.5 + 0.38 * Math.sin(through * Math.PI * 3.1);
                add(box.width * across, box.height * 0.08, 1.5);
                add(box.width * across, box.height * 0.08, 1.5);
                start();
            });
        }, { passive: true });

        window.addEventListener('resize', resize, { passive: true });
        resize();
    });
}

glassCursor();
confettiCursor();

// Certificates collapse to their first row. The class and the button are both
// added here, so with JS off the whole grid is simply on the page - no button
// that does nothing, and nothing hidden behind one.
function certificateRows() {
    document.querySelectorAll('.cert-grid').forEach(grid => {
        const cards = grid.querySelectorAll('.cert-card');
        // nothing to fold away if the first row is all there is
        if (cards.length <= 4) return;

        grid.classList.add('is-collapsed');

        const wrap = document.createElement('div');
        wrap.className = 'cert-more';

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-ghost';
        button.setAttribute('aria-expanded', 'false');
        button.textContent = 'Poka\u017c wszystkie certyfikaty';

        button.addEventListener('click', () => {
            const open = !grid.classList.contains('is-collapsed');
            grid.classList.toggle('is-collapsed', open);
            button.setAttribute('aria-expanded', open ? 'false' : 'true');
            button.textContent = open
                ? 'Poka\u017c wszystkie certyfikaty'
                : 'Poka\u017c mniej';
        });

        wrap.appendChild(button);
        grid.after(wrap);
    });
}

certificateRows();

// A card on the price list books the treatment it shows: the form's dropdown
// arrives already set to whatever was clicked, so nobody has to find it in a
// list of fifteen. The link still works without this - it just lands on the
// form with nothing chosen.
function prefillService() {
    const select = document.getElementById('service');
    if (!select) return;

    document.querySelectorAll('[data-service]').forEach(link => {
        link.addEventListener('click', () => {
            const wanted = link.getAttribute('data-service');
            if (!select.querySelector('option[value="' + wanted + '"]')) return;
            select.value = wanted;
            select.dispatchEvent(new Event('change', { bubbles: true }));
        });
    });
}

prefillService();
