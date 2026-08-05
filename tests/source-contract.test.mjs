import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("desktop retains the navigation and completes at 80 percent", async () => {
  const [desktop, navigation] = await Promise.all([
    read("app/DesktopExperience.tsx"),
    read("app/components/PersistentNav.tsx"),
  ]);
  assert.match(desktop, /next >= 80/);
  assert.match(desktop, /<PersistentNav \/>/);
  assert.match(navigation, /data-testid="persistent-navbar"/);
  assert.match(navigation, /className="brand-icon"/);
  assert.match(navigation, /className="brand-wordmark"/);
  assert.match(navigation, /sunday-logo-source\.png/);
  assert.doesNotMatch(navigation, />SUNDAY</);
});

test("desktop painting is phone-only and does not create a scroll reveal", async () => {
  const desktop = await read("app/DesktopExperience.tsx");
  assert.doesNotMatch(desktop, /onPointer(?:Down|Move|Up|Cancel)/);
  assert.doesNotMatch(desktop, /unlocked-content/);
  assert.doesNotMatch(desktop, /MAKE YOUR MEMO/);
  assert.match(desktop, /className="scan-sticker"/);
  assert.match(desktop, /scan-me-sticker-v2\.png/);
  assert.match(desktop, /className="scan-sticker-qr"/);
});

test("the last twenty percent is completed with spray stamps", async () => {
  const desktop = await read("app/DesktopExperience.tsx");
  assert.match(desktop, /const finishFrame/);
  assert.match(desktop, /drawSprayReveal\(context/);
  assert.match(desktop, /BRUSH_RADIUS \* 0\.72/);
  assert.doesNotMatch(desktop, /is-complete \.erase-canvas/);
});

test("the opening artwork includes a fixed bottom-corner spray teaser", async () => {
  const desktop = await read("app/DesktopExperience.tsx");
  assert.match(desktop, /x: 0\.988, y: 0\.982/);
  assert.match(desktop, /BRUSH_RADIUS \* 1\.35/);
  assert.match(desktop, /x: 0\.947, y: 0\.958/);
  assert.match(desktop, /BRUSH_RADIUS \* 1\.05/);
  assert.match(desktop, /x: 0\.885, y: 0\.975/);
  assert.match(desktop, /BRUSH_RADIUS \* 0\.82/);
});

test("customization gateway loads the four supplied models into a scroll ring", async () => {
  const [customizer, css] = await Promise.all([
    read("app/components/CustomizationExperience.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(customizer, /name: "Terrace Hat"/);
  assert.match(customizer, /name: "Study Buddy"/);
  assert.match(customizer, /name: "Headset"/);
  assert.match(customizer, /name: "Bucket Hat"/);
  assert.match(customizer, /sunday-favorite\.webp/);
  assert.match(customizer, /className="favorite-title-sticker"/);
  assert.match(customizer, /className="customize-heading"/);
  assert.doesNotMatch(customizer, /new THREE\.PlaneGeometry/);
  assert.doesNotMatch(customizer, /new THREE\.TextureLoader/);
  assert.match(css, /\.customize-canvas[^}]+transform: translateY\(150px\)/s);
  assert.match(css, /\.favorite-title-sticker[^}]+transform: rotate\(8deg\)/s);
  assert.match(customizer, /new GLTFLoader/);
  assert.match(customizer, /window\.addEventListener\("wheel"/);
  assert.match(customizer, /targetRotation/);
  assert.match(customizer, /verticalProgress = \(Math\.cos\(angle\) \+ 1\) \/ 2/);
  assert.match(customizer, /0\.55 - Math\.pow\(verticalProgress, 1\.65\) \* 4\.45/);
  assert.match(customizer, /new UnrealBloomPass/);
  assert.match(customizer, /new FilmPass\(0\.08/);
  assert.match(customizer, /Math\.sin\(now \* 0\.00055 \+ pivot\.userData\.idlePhase\) \* 0\.16/);
  assert.doesNotMatch(customizer, /pivot\.rotation\.y \+=/);
});

test("the initial page is covered by a Sunday memo-building loader", async () => {
  const [desktop, loader, css] = await Promise.all([
    read("app/DesktopExperience.tsx"),
    read("app/components/MemoBootSequence.tsx"),
    read("app/globals.css"),
  ]);
  assert.match(desktop, /<MemoBootSequence ready={artworkReady} \/>/);
  assert.match(desktop, /requestAnimationFrame\(\(\) => setArtworkReady\(true\)\)/);
  assert.match(loader, /Building Memo/);
  assert.match(loader, /sunday-logo-source\.png/);
  assert.match(loader, /padStart\(3, "0"\)/);
  assert.match(css, /@keyframes memo-logo-step/);
  assert.match(css, /rotate\(45deg\)/);
  assert.match(css, /height: 1px/);
});

test("spray brush uses varied destination-out stamps", async () => {
  const brush = await read("app/lib/spray-reveal-brush.ts");
  assert.match(brush, /const VARIANTS = 8/);
  assert.match(brush, /globalCompositeOperation = "destination-out"/);
  assert.match(brush, /rotate\(rotation\)/);
});

test("phone tracker recognizes both artwork versions with a homography", async () => {
  const tracker = await read("app/lib/artwork-feature-tracker.ts");
  assert.match(tracker, /new cv\.ORB/);
  assert.match(tracker, /cv\.findHomography/);
  assert.match(tracker, /hero-start\.webp/);
  assert.match(tracker, /hidden-hero-poster\.webp/);
});

test("phone sends latest tracking position without blocking vision", async () => {
  const phone = await read("app/PhoneExperience.tsx");
  assert.match(phone, /const FRAME_INTERVAL = 16/);
  assert.match(phone, /let pending:/);
  assert.match(phone, /requestInFlight/);
});

test("phone uses the supplied full-screen spray artwork with one instruction", async () => {
  const [phone, css] = await Promise.all([read("app/PhoneExperience.tsx"), read("app/globals.css")]);
  assert.match(phone, /POINT AT YOUR SCREEN TO PAINT/);
  assert.doesNotMatch(phone, /phone-brush-reticle/);
  assert.doesNotMatch(phone, /phone-header/);
  assert.match(css, /phone-spray-reference\.webp/);
  assert.match(css, /background: #eeeae6[^;]+center \/ cover no-repeat/);
});

test("the revealed hero uses optimized video sources", async () => {
  const desktop = await read("app/DesktopExperience.tsx");
  assert.match(desktop, /className="hidden-artwork"/);
  assert.match(desktop, /hidden-hero\.webm/);
  assert.match(desktop, /hidden-hero\.mp4/);
  assert.match(desktop, /hidden-hero-poster\.webp/);
  assert.match(desktop, /PAINT_PIXEL_RATIO = 1\.5/);
});

test("Sunday-inspired design tokens and integrated QR sticker are present", async () => {
  const css = await read("app/globals.css");
  assert.match(css, /--yellow: #ffe817/);
  assert.match(css, /\.persistent-nav/);
  assert.match(css, /\.scan-sticker/);
  assert.match(css, /\.scan-sticker-qr/);
  assert.match(css, /top: 30%/);
  assert.match(css, /overflow: hidden/);
});

test("production sessions use shared Redis with a local fallback", async () => {
  const [store, sessionsRoute] = await Promise.all([
    read("app/lib/session-store.ts"),
    read("app/api/sessions/route.ts"),
  ]);
  assert.match(store, /from "@upstash\/redis"/);
  assert.match(store, /process\.env\.KV_REST_API_URL/);
  assert.match(store, /__phonePaintSessions/);
  assert.match(store, /redis\.pipeline\(\)/);
  assert.match(store, /UPDATE_CURSOR/);
  assert.match(sessionsRoute, /await createPaintSession\(\)/);
});
