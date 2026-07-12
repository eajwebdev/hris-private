import { useEffect, useRef } from 'react';

/**
 * Animated backdrop for the sign-in screen.
 *
 * A slowly drifting network of nodes that link up when they drift close together —
 * an org chart forming and reforming. Chosen over generic floating blobs because it
 * says something about the product: people, connected.
 *
 * Drawn on a canvas rather than as DOM nodes: ~70 elements, each measured against every
 * other on every frame, would thrash layout — a canvas is one composited layer.
 */
export default function AuthBackground() {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Honour the OS "reduce motion" setting — the static gradient layers behind this
        // canvas still carry the design, so bailing out costs nothing visually.
        const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
        if (reduced.matches) return;

        const ctx = canvas.getContext('2d');
        let width = 0;
        let height = 0;
        let nodes = [];
        let frame;

        // Pull the live brand colour so the network re-tints with the tenant's theme.
        const brand = getComputedStyle(document.documentElement)
            .getPropertyValue('--brand').trim() || '#d61b5d';
        const rgb = hexToRgb(brand);

        const LINK_DISTANCE = 150;

        function resize() {
            // Cap the DPR: on a 3x phone a full-bleed canvas is a lot of pixels to fill
            // 60 times a second for a decorative layer.
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const rect = canvas.getBoundingClientRect();

            width = rect.width;
            height = rect.height;
            canvas.width = width * dpr;
            canvas.height = height * dpr;
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

            // Scale the population to the area so a wide desktop isn't sparse and a
            // phone isn't a solid mesh.
            const count = Math.min(90, Math.max(28, Math.round((width * height) / 18000)));

            nodes = Array.from({ length: count }, () => ({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 0.25,
                vy: (Math.random() - 0.5) * 0.25,
                r: Math.random() * 1.6 + 1,
            }));
        }

        function draw() {
            ctx.clearRect(0, 0, width, height);

            for (const node of nodes) {
                node.x += node.vx;
                node.y += node.vy;

                // Bounce off the edges so the field never drains out of frame.
                if (node.x <= 0 || node.x >= width) node.vx *= -1;
                if (node.y <= 0 || node.y >= height) node.vy *= -1;
            }

            // Links first, so the nodes sit on top of the threads rather than under them.
            for (let i = 0; i < nodes.length; i++) {
                for (let j = i + 1; j < nodes.length; j++) {
                    const dx = nodes[i].x - nodes[j].x;
                    const dy = nodes[i].y - nodes[j].y;
                    const dist = Math.hypot(dx, dy);

                    if (dist > LINK_DISTANCE) continue;

                    // Fade the thread out as the pair drifts apart — the connection
                    // dissolving is the whole effect.
                    const alpha = (1 - dist / LINK_DISTANCE) * 0.32;

                    ctx.strokeStyle = `rgba(${rgb}, ${alpha})`;
                    ctx.lineWidth = 0.7;
                    ctx.beginPath();
                    ctx.moveTo(nodes[i].x, nodes[i].y);
                    ctx.lineTo(nodes[j].x, nodes[j].y);
                    ctx.stroke();
                }
            }

            for (const node of nodes) {
                ctx.fillStyle = `rgba(255, 255, 255, 0.55)`;
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.r, 0, Math.PI * 2);
                ctx.fill();
            }

            frame = requestAnimationFrame(draw);
        }

        resize();
        draw();

        window.addEventListener('resize', resize);

        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener('resize', resize);
        };
    }, []);

    return (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
            {/* Aurora wash. Long, offset durations so the two blooms never visibly loop together. */}
            <div className="aurora aurora-1" />
            <div className="aurora aurora-2" />

            <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

            {/* Fine dot grid + a vignette to seat the card against the field. */}
            <div
                className="absolute inset-0 opacity-[0.06]"
                style={{
                    backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
                    backgroundSize: '32px 32px',
                }}
            />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(5,8,25,0.75)_100%)]" />
        </div>
    );
}

/** '#d61b5d' → '214, 27, 93' so it can be dropped into an rgba() with a live alpha. */
function hexToRgb(hex) {
    const clean = hex.replace('#', '');
    const full = clean.length === 3
        ? clean.split('').map((c) => c + c).join('')
        : clean;

    const int = parseInt(full, 16);

    return [(int >> 16) & 255, (int >> 8) & 255, int & 255].join(', ');
}
