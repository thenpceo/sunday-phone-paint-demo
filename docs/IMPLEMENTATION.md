# Implementation notes

This document explains the main technical decisions behind the Sunday Memo phone-paint experiment. The code intentionally avoids a native app: both displays run ordinary web pages, and the phone camera is accessed through `getUserMedia` on the secure `/phone` route.

## 1. Pairing the displays

The desktop creates an ephemeral 128-bit session token through `POST /api/sessions`. The response includes a phone URL, and the desktop converts it into the custom QR sticker using the `qrcode` package.

In production, the request origin is already the Vercel deployment domain, so the generated QR naturally targets the live `/phone` route. `PHONE_PAINT_PUBLIC_ORIGIN` exists only as an explicit HTTPS override for local tunnel testing.

Sessions expire after 30 minutes. Vercel uses Upstash Redis hashes so the desktop and phone share state even when serverless requests land on different instances. The store falls back to a process-local `Map` when Redis credentials are absent, keeping local setup simple.

## 2. Using the artwork as the marker

Large corner markers worked, but they competed with the design and forced the phone too far from the screen. The final version treats the artwork itself as a planar tracking target.

The phone tracker:

1. Loads lightweight reference images for the opening and hidden artwork.
2. Detects ORB keypoints and binary descriptors in each camera frame.
3. Matches descriptors with Hamming distance.
4. Rejects weak matches and uses RANSAC to find a homography.
5. Projects the camera center through the inverse relationship into normalized artwork space.
6. Sends only the newest valid coordinate to the server.

The two-reference approach lets tracking continue as the original page disappears and the hidden artwork becomes dominant.

## 3. Keeping the paint responsive

Computer vision and network transport operate at different speeds. Queuing every camera result produces stale motion, so the phone keeps one pending coordinate and replaces it whenever a newer frame finishes. A new request starts only after the current request resolves.

The desktop polls the compact session snapshot, then eases its visual brush toward the latest target at display rate. Large jumps receive a stronger blend; nearby points use gentler interpolation. This makes modest network jitter feel continuous without adding a long smoothing delay.

## 4. Building the spray mask

The visible opening artwork lives on an opaque canvas above the hidden video. Painting does not draw the new page—it erases the old one.

The spray brush prepares a small atlas of procedural stamps once, then reuses it. Each stroke varies:

- radius and pressure
- rotation
- edge breakup
- positional jitter
- secondary droplets and bursts
- stutter timing

Canvas `destination-out` removes the opening pixels. Interpolated samples fill the space between network positions so fast phone movement does not leave a dotted trail.

## 5. Measuring completion

A coarse 80 × 45 occupancy grid measures meaningful coverage without reading the full canvas pixel buffer. Each interpolated brush sample marks nearby cells inside an aspect-corrected radius.

When coverage reaches 80%, the remaining unpainted cells are shuffled into a finishing queue. Several candidates are erased per animation frame with smaller spray stamps. The page therefore completes using the same physical language as the interaction rather than switching to an opacity fade.

## 6. Loading without visual leaks

The hidden hero video sits underneath the opening canvas. On an uncached visit, the video could appear before the starting artwork was decoded and drawn. The memo loader is rendered immediately and stays above the entire experience until the opening image has loaded, the canvas has been painted, and the browser has reached another animation frame.

The progress display advances toward 92 while assets prepare, waits if necessary, then finishes at 100. The Sunday mark rotates in 45-degree increments with pauses. Reduced-motion preferences collapse the decorative animation into an effectively immediate state change.

## 7. The Three.js customizer

The four source GLBs were compressed before shipping. At runtime, the scene:

- normalizes each model to a shared bounding size
- distributes pivots around a circular selection angle
- maps that circle into a downward vertical screen arc
- layers subtle Unreal bloom and film grain
- rotates the selection with wheel or arrow-key input
- gently oscillates each object within roughly ±9 degrees, preserving its front view

The canvas is dynamically imported only after the paint reveal completes, keeping the initial page lighter.

## 8. Performance choices

- Optimized WebM and MP4 sources with a poster fallback
- Compressed GLB assets instead of the original large exports
- Capped renderer and paint-canvas pixel ratios
- Cached spray textures
- Latest-position-only phone transport
- Display-rate desktop interpolation
- Dynamically loaded Three.js customizer
- Short-lived server state with explicit no-store response headers

## 9. Known constraints

- Markerless tracking depends on visible image detail, camera focus, screen glare, and ambient light.
- The phone and laptop both need internet access for the deployed experience.
- Redis command volume grows while a session is actively painting; the demo is designed for short portfolio interactions, not high-concurrency production traffic.
- iOS camera permission requires the secure deployed URL and an explicit user gesture when the browser requires one.

## Disclaimer

This project is an independent technical exploration and is not affiliated with Sunday Robotics. Sunday branding and related intellectual property belong to their respective owners and are shown only to demonstrate the interaction concept.
