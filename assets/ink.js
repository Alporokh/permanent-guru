/*
 * Ink - a small Navier-Stokes fluid simulation that paints brand-magenta dye
 * over the tattoo photo on the home page.
 *
 * It is deliberately lazy and sleepy, because this is decoration on a
 * marketing page and must not cost anything on load:
 *
 *   - no WebGL context exists until the pointer first reaches the photo
 *     (or, where there is no pointer, until the photo scrolls into view),
 *   - the render loop stops a couple of seconds after the pointer leaves,
 *   - the buffers are cleared on the way out, so the next visit starts blank,
 *   - it stops when the tab is hidden or the photo scrolls away.
 *
 * If anything it needs is missing - WebGL2, float render targets - or the
 * visitor has asked for reduced motion, the photo is simply left alone.
 *
 * The dye is written premultiplied: rgb is always the brand magenta scaled by
 * the same factor as alpha, so the canvas composites over the photo at exactly
 * one hue and never washes out to white where splats overlap.
 */
(function () {
    'use strict';

    // #971756, the brand magenta, in linear 0-1 channels.
    const INK = [0.592, 0.090, 0.337];
    const PEAK = 0.592; // INK's largest channel, used to normalise intensity

    const CONFIG = {
        simRes: 128,
        dyeRes: 512,
        densityDissipation: 0.85,
        velocityDissipation: 0.22,
        pressureIterations: 20,
        curl: 40,
        splatRadius: 0.00075,
        splatForce: 9000,
        // How long the ink keeps swirling after the pointer leaves.
        fadeMs: 2200,
        // Dye strength per splat, and a hard ceiling on the whole layer. Both
        // are low on purpose: this sits on top of a photograph, and anything
        // heavier stops looking like ink in water and starts looking like
        // someone drew on the picture with a marker.
        splatStrength: 0.13,
        maxOpacity: 0.62,
    };

    const BASE_VERT = `#version 300 es
precision highp float;
in vec2 aPosition;
out vec2 vUv;
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
    vUv = aPosition * 0.5 + 0.5;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(aPosition, 0.0, 1.0);
}`;

    const CLEAR_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform float value;
void main () {
    fragColor = value * texture(uTexture, vUv);
}`;

    const SPLAT_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform float radius;
void main () {
    vec2 p = vUv - point;
    p.x *= aspectRatio;
    vec3 splat = exp(-dot(p, p) / radius) * color;
    vec3 base = texture(uTarget, vUv).xyz;
    fragColor = vec4(base + splat, 1.0);
}`;

    const ADVECTION_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main () {
    vec2 coord = vUv - dt * texture(uVelocity, vUv).xy * texelSize;
    fragColor = texture(uSource, coord) / (1.0 + dissipation * dt);
}`;

    const DIVERGENCE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
void main () {
    float L = texture(uVelocity, vL).x;
    float R = texture(uVelocity, vR).x;
    float T = texture(uVelocity, vT).y;
    float B = texture(uVelocity, vB).y;
    vec2 C = texture(uVelocity, vUv).xy;
    if (vL.x < 0.0) { L = -C.x; }
    if (vR.x > 1.0) { R = -C.x; }
    if (vT.y > 1.0) { T = -C.y; }
    if (vB.y < 0.0) { B = -C.y; }
    fragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}`;

    const CURL_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
void main () {
    float L = texture(uVelocity, vL).y;
    float R = texture(uVelocity, vR).y;
    float T = texture(uVelocity, vT).x;
    float B = texture(uVelocity, vB).x;
    fragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}`;

    // Vorticity confinement. This is what gives the ink its filaments and
    // curls - without it the dye just smears and reads as a gradient.
    const VORTICITY_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
    float L = texture(uCurl, vL).x;
    float R = texture(uCurl, vR).x;
    float T = texture(uCurl, vT).x;
    float B = texture(uCurl, vB).x;
    float C = texture(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;
    vec2 velocity = texture(uVelocity, vUv).xy + force * dt;
    fragColor = vec4(clamp(velocity, -1000.0, 1000.0), 0.0, 1.0);
}`;

    const PRESSURE_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
    float L = texture(uPressure, vL).x;
    float R = texture(uPressure, vR).x;
    float T = texture(uPressure, vT).x;
    float B = texture(uPressure, vB).x;
    float divergence = texture(uDivergence, vUv).x;
    fragColor = vec4((L + R + B + T - divergence) * 0.25, 0.0, 0.0, 1.0);
}`;

    const GRADIENT_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 fragColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
    float L = texture(uPressure, vL).x;
    float R = texture(uPressure, vR).x;
    float T = texture(uPressure, vT).x;
    float B = texture(uPressure, vB).x;
    vec2 velocity = texture(uVelocity, vUv).xy - vec2(R - L, T - B);
    fragColor = vec4(velocity, 0.0, 1.0);
}`;

    // Collapses the dye back onto a single hue. Intensity drives alpha, and rgb
    // is that same intensity times the brand colour, which is exactly what
    // premultiplied alpha wants - so overlapping splats deepen instead of
    // drifting towards white.
    const DISPLAY_FRAG = `#version 300 es
precision highp float;
precision highp sampler2D;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTexture;
uniform vec3 uColor;
uniform float uPeak;
uniform float uAlpha;
void main () {
    vec3 c = texture(uTexture, vUv).rgb;
    float t = clamp(max(c.r, max(c.g, c.b)) / uPeak, 0.0, 1.0);
    fragColor = vec4(uColor * t, t) * uAlpha;
}`;

    function compile(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    function buildProgram(gl, vertSrc, fragSrc) {
        const vert = compile(gl, gl.VERTEX_SHADER, vertSrc);
        const frag = compile(gl, gl.FRAGMENT_SHADER, fragSrc);
        if (!vert || !frag) return null;

        const program = gl.createProgram();
        gl.attachShader(program, vert);
        gl.attachShader(program, frag);
        // Fixed location so one quad buffer serves every program.
        gl.bindAttribLocation(program, 0, 'aPosition');
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;

        const uniforms = {};
        const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
        for (let i = 0; i < count; i++) {
            const name = gl.getActiveUniform(program, i).name;
            uniforms[name] = gl.getUniformLocation(program, name);
        }
        return { program, uniforms };
    }

    function createInk(container, canvas) {
        const gl = canvas.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: true,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            powerPreference: 'low-power',
        });
        if (!gl) return null;
        // Half-float render targets. Without these the solver cannot hold
        // velocity between frames, so there is no point starting.
        if (!gl.getExtension('EXT_color_buffer_float')) return null;

        const programs = {
            clear: buildProgram(gl, BASE_VERT, CLEAR_FRAG),
            splat: buildProgram(gl, BASE_VERT, SPLAT_FRAG),
            advection: buildProgram(gl, BASE_VERT, ADVECTION_FRAG),
            divergence: buildProgram(gl, BASE_VERT, DIVERGENCE_FRAG),
            curl: buildProgram(gl, BASE_VERT, CURL_FRAG),
            vorticity: buildProgram(gl, BASE_VERT, VORTICITY_FRAG),
            pressure: buildProgram(gl, BASE_VERT, PRESSURE_FRAG),
            gradient: buildProgram(gl, BASE_VERT, GRADIENT_FRAG),
            display: buildProgram(gl, BASE_VERT, DISPLAY_FRAG),
        };
        for (const key in programs) {
            if (!programs[key]) return null;
        }

        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
        const indices = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indices);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(0);
        gl.disable(gl.BLEND);

        function createFBO(w, h, internalFormat, format, filter) {
            gl.activeTexture(gl.TEXTURE0);
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, w, h, 0, format, gl.HALF_FLOAT, null);

            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
            gl.viewport(0, 0, w, h);
            gl.clear(gl.COLOR_BUFFER_BIT);

            return {
                texture, fbo, width: w, height: h,
                texelSizeX: 1 / w, texelSizeY: 1 / h,
                attach(id) {
                    gl.activeTexture(gl.TEXTURE0 + id);
                    gl.bindTexture(gl.TEXTURE_2D, texture);
                    return id;
                },
            };
        }

        function createDoubleFBO(w, h, internalFormat, format, filter) {
            return {
                read: createFBO(w, h, internalFormat, format, filter),
                write: createFBO(w, h, internalFormat, format, filter),
                width: w, height: h,
                texelSizeX: 1 / w, texelSizeY: 1 / h,
                swap() {
                    const tmp = this.read;
                    this.read = this.write;
                    this.write = tmp;
                },
            };
        }

        function blit(target) {
            if (target) {
                gl.viewport(0, 0, target.width, target.height);
                gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            } else {
                gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
            gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
        }

        // Aspect-correct sim grid: a square grid on a 5:4 box stretches the
        // curls, which looks wrong on a photo.
        function dimensions(resolution) {
            const ratio = gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1);
            const min = Math.round(resolution);
            const max = Math.round(resolution * (ratio >= 1 ? ratio : 1 / ratio));
            return ratio >= 1 ? { width: max, height: min } : { width: min, height: max };
        }

        let dye, velocity, divergence, curl, pressure;

        function initBuffers() {
            const sim = dimensions(CONFIG.simRes);
            const dyeSize = dimensions(CONFIG.dyeRes);
            dye = createDoubleFBO(dyeSize.width, dyeSize.height, gl.RGBA16F, gl.RGBA, gl.LINEAR);
            velocity = createDoubleFBO(sim.width, sim.height, gl.RG16F, gl.RG, gl.LINEAR);
            divergence = createFBO(sim.width, sim.height, gl.R16F, gl.RED, gl.NEAREST);
            curl = createFBO(sim.width, sim.height, gl.R16F, gl.RED, gl.NEAREST);
            pressure = createDoubleFBO(sim.width, sim.height, gl.R16F, gl.RED, gl.NEAREST);
        }

        function use(p) {
            gl.useProgram(p.program);
            return p.uniforms;
        }

        function step(dt) {
            let u = use(programs.curl);
            gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(u.uVelocity, velocity.read.attach(0));
            blit(curl);

            u = use(programs.vorticity);
            gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(u.uVelocity, velocity.read.attach(0));
            gl.uniform1i(u.uCurl, curl.attach(1));
            gl.uniform1f(u.curl, CONFIG.curl);
            gl.uniform1f(u.dt, dt);
            blit(velocity.write);
            velocity.swap();

            u = use(programs.divergence);
            gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(u.uVelocity, velocity.read.attach(0));
            blit(divergence);

            u = use(programs.clear);
            gl.uniform1i(u.uTexture, pressure.read.attach(0));
            gl.uniform1f(u.value, 0.8);
            blit(pressure.write);
            pressure.swap();

            u = use(programs.pressure);
            gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(u.uDivergence, divergence.attach(0));
            for (let i = 0; i < CONFIG.pressureIterations; i++) {
                gl.uniform1i(u.uPressure, pressure.read.attach(1));
                blit(pressure.write);
                pressure.swap();
            }

            u = use(programs.gradient);
            gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            gl.uniform1i(u.uPressure, pressure.read.attach(0));
            gl.uniform1i(u.uVelocity, velocity.read.attach(1));
            blit(velocity.write);
            velocity.swap();

            u = use(programs.advection);
            gl.uniform2f(u.texelSize, velocity.texelSizeX, velocity.texelSizeY);
            const velocityId = velocity.read.attach(0);
            gl.uniform1i(u.uVelocity, velocityId);
            gl.uniform1i(u.uSource, velocityId);
            gl.uniform1f(u.dt, dt);
            gl.uniform1f(u.dissipation, CONFIG.velocityDissipation);
            blit(velocity.write);
            velocity.swap();

            // texelSize deliberately stays at the VELOCITY texel size here.
            // The advection step walks back along the velocity field, which is
            // measured in simulation texels; feeding it the dye texture's own
            // (4x finer) texels makes the ink crawl at a quarter speed and the
            // whole thing stops looking like a fluid.
            gl.uniform1i(u.uVelocity, velocity.read.attach(0));
            gl.uniform1i(u.uSource, dye.read.attach(1));
            gl.uniform1f(u.dissipation, CONFIG.densityDissipation);
            blit(dye.write);
            dye.swap();
        }

        function render(alpha) {
            const u = use(programs.display);
            gl.uniform1i(u.uTexture, dye.read.attach(0));
            gl.uniform3f(u.uColor, INK[0], INK[1], INK[2]);
            gl.uniform1f(u.uPeak, PEAK);
            gl.uniform1f(u.uAlpha, alpha * CONFIG.maxOpacity);
            blit(null);
        }

        function splat(x, y, dx, dy, strength) {
            const aspect = gl.drawingBufferWidth / Math.max(gl.drawingBufferHeight, 1);

            let u = use(programs.splat);
            gl.uniform1i(u.uTarget, velocity.read.attach(0));
            gl.uniform1f(u.aspectRatio, aspect);
            gl.uniform2f(u.point, x, y);
            gl.uniform3f(u.color, dx, dy, 0.0);
            gl.uniform1f(u.radius, CONFIG.splatRadius);
            blit(velocity.write);
            velocity.swap();

            u = use(programs.splat);
            gl.uniform1i(u.uTarget, dye.read.attach(0));
            gl.uniform1f(u.aspectRatio, aspect);
            gl.uniform2f(u.point, x, y);
            gl.uniform3f(u.color, INK[0] * strength, INK[1] * strength, INK[2] * strength);
            gl.uniform1f(u.radius, CONFIG.splatRadius);
            blit(dye.write);
            dye.swap();
        }

        function wipe() {
            [dye, velocity, pressure].forEach(buf => {
                const u = use(programs.clear);
                gl.uniform1f(u.value, 0.0);
                gl.uniform1i(u.uTexture, buf.read.attach(0));
                blit(buf.write);
                buf.swap();
                gl.uniform1i(u.uTexture, buf.read.attach(0));
                blit(buf.write);
                buf.swap();
            });
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }

        function resize() {
            const rect = container.getBoundingClientRect();
            if (!rect.width || !rect.height) return false;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.max(1, Math.round(rect.width * dpr));
            const h = Math.max(1, Math.round(rect.height * dpr));
            if (canvas.width === w && canvas.height === h && dye) return false;
            canvas.width = w;
            canvas.height = h;
            initBuffers();
            return true;
        }

        resize();
        if (!dye) return null;

        return { step, render, splat, wipe, resize, lost: () => gl.isContextLost() };
    }

    function mount(container) {
        const canvas = document.createElement('canvas');
        canvas.className = 'ink';
        canvas.setAttribute('aria-hidden', 'true');
        container.appendChild(canvas);

        let ink = null;
        let failed = false;
        let running = false;
        let pointerInside = false;
        let selfStir = false;
        let leftAt = 0;
        let lastFrame = 0;
        // Media queries only describe what the device has, not what is being
        // used: a Windows laptop with a touchscreen reports no fine pointer at
        // all. So this is only the opening guess, and a real mouse or pen event
        // overrides it for good.
        let selfStirAllowed = !window.matchMedia('(any-pointer: fine)').matches;
        let stirUntil = 0;
        let last = null;
        let stirPhase = Math.random() * 1000;

        function ensure() {
            if (ink || failed) return !!ink;
            ink = createInk(container, canvas);
            if (!ink) {
                failed = true;
                canvas.remove();
            }
            return !!ink;
        }

        function frame(now) {
            if (!running || !ink) return;
            if (ink.lost()) { running = false; return; }

            const dt = Math.min(Math.max((now - lastFrame) / 1000, 0.0001), 0.0166);
            lastFrame = now;

            // Self-stirring is on a budget. Left alone on a phone parked at
            // this section it would otherwise churn the GPU indefinitely.
            if (selfStir && now > stirUntil) {
                selfStir = false;
                leftAt = now;
            }

            if (selfStir) {
                // No pointer to follow, so drive it along a slow open path.
                // Two incommensurate frequencies keep it from visibly looping.
                stirPhase += dt;
                const x = 0.5 + 0.30 * Math.sin(stirPhase * 0.90);
                const y = 0.5 + 0.22 * Math.sin(stirPhase * 0.63 + 1.7);
                if (last) {
                    splatFrom(x, y, (x - last.x) * CONFIG.splatForce * 0.5,
                        (y - last.y) * CONFIG.splatForce * 0.5, CONFIG.splatStrength * 0.8);
                }
                last = { x, y };
            }

            const alpha = pointerInside || selfStir
                ? 1
                : Math.max(0, 1 - (now - leftAt) / CONFIG.fadeMs);

            ink.step(dt);
            ink.render(alpha);

            if (alpha <= 0) {
                running = false;
                last = null;
                ink.wipe();
                return;
            }
            requestAnimationFrame(frame);
        }

        function start() {
            if (running || !ensure()) return;
            running = true;
            lastFrame = performance.now();
            requestAnimationFrame(frame);
        }

        function splatFrom(x, y, dx, dy, strength) {
            if (ink) ink.splat(x, y, dx, dy, strength);
        }

        function pointerAt(event) {
            const rect = canvas.getBoundingClientRect();
            if (!rect.width || !rect.height) return null;
            return {
                x: (event.clientX - rect.left) / rect.width,
                y: 1 - (event.clientY - rect.top) / rect.height,
            };
        }

        container.addEventListener('pointerenter', event => {
            if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
            // A real hovering pointer exists after all - stop second-guessing
            // the device and hand the effect over to it.
            selfStirAllowed = false;
            selfStir = false;
            pointerInside = true;
            if (!ensure()) return;
            ink.resize();
            last = pointerAt(event);
            start();
        });

        container.addEventListener('pointermove', event => {
            if (!pointerInside || !ink) return;
            const p = pointerAt(event);
            if (!p) return;
            if (last) {
                const dx = (p.x - last.x) * CONFIG.splatForce;
                const dy = (p.y - last.y) * CONFIG.splatForce;
                if (dx * dx + dy * dy > 0.4) splatFrom(p.x, p.y, dx, dy, CONFIG.splatStrength);
            }
            last = p;
        });

        container.addEventListener('pointerleave', () => {
            if (!pointerInside) return;
            pointerInside = false;
            leftAt = performance.now();
            last = null;
        });

        // Where there is no pointer to follow, the photo stirs itself - but
        // only while it is actually on screen, and only for a while.
        const STIR_BUDGET_MS = 12000;
        if ('IntersectionObserver' in window) {
            new IntersectionObserver(entries => {
                const visible = entries.some(e => e.isIntersecting);
                if (visible && selfStirAllowed) {
                    selfStir = true;
                    stirUntil = performance.now() + STIR_BUDGET_MS;
                    if (ensure()) { ink.resize(); start(); }
                } else if (!visible) {
                    if (selfStir) {
                        selfStir = false;
                        leftAt = performance.now();
                    }
                    if (pointerInside) {
                        pointerInside = false;
                        leftAt = performance.now();
                    }
                }
            }, { threshold: 0.35 }).observe(container);
        }

        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                running = false;
                pointerInside = false;
                selfStir = false;
                last = null;
                if (ink) ink.wipe();
            } else if (selfStirAllowed) {
                selfStir = true;
                stirUntil = performance.now() + STIR_BUDGET_MS;
                start();
            }
        });

        window.addEventListener('resize', () => {
            if (ink && ink.resize()) last = null;
        }, { passive: true });
    }

    function boot() {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        document.querySelectorAll('[data-ink]').forEach(mount);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', boot);
    } else {
        boot();
    }
})();
