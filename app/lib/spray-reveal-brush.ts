const SIZE = 320;
const CENTER = SIZE / 2;
const RADIUS = 138;
const VARIANTS = 8;
type Point = { x: number; y: number; at: number };
let textures: HTMLCanvasElement[] | null = null;

export function prepareSprayRevealBrush() { getTextures(); }

export function drawSprayReveal(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  last: Point | null,
  point: Point,
  normalizedRadius: number,
) {
  const radius = width * normalizedRadius;
  const heading = last ? Math.atan2((point.y - last.y) * height, (point.x - last.x) * width) : 0;
  const random = seededRandom(pointSeed(point));
  const set = getTextures();
  const stamp = set[Math.floor(random() * set.length)];
  const pulse = 0.9 + random() * 0.2;
  const stutter = random() > 0.82 ? 0.72 : 1;
  const jitterDistance = radius * (0.02 + random() * 0.08);
  const jitterAngle = heading + (random() - 0.5) * Math.PI;
  const rotation = Math.floor(random() * 16) * (Math.PI / 8) + heading * 0.16;
  const stampSize = radius * 2.42 * pulse;
  const x = point.x * width + Math.cos(jitterAngle) * jitterDistance;
  const y = point.y * height + Math.sin(jitterAngle) * jitterDistance;

  context.save();
  context.globalCompositeOperation = "destination-out";
  context.globalAlpha = stutter;
  context.translate(x, y);
  context.rotate(rotation);
  context.scale(1, 0.93 + random() * 0.14);
  context.drawImage(stamp, -stampSize / 2, -stampSize / 2, stampSize, stampSize);
  if (random() > 0.7) {
    const echoSize = stampSize * (0.36 + random() * 0.18);
    const echoOffset = radius * (0.36 + random() * 0.28);
    context.globalAlpha = 0.44 + random() * 0.28;
    context.rotate((random() - 0.5) * 0.8);
    context.drawImage(
      set[(Math.floor(random() * set.length) + 1) % set.length],
      Math.cos(heading) * echoOffset - echoSize / 2,
      Math.sin(heading) * echoOffset - echoSize / 2,
      echoSize,
      echoSize,
    );
  }
  context.restore();
}

function getTextures() {
  if (textures) return textures;
  textures = Array.from({ length: VARIANTS }, (_, index) => createTexture(0x91e10da5 ^ index * 0x9e3779b1));
  return textures;
}

function createTexture(seed: number) {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) return canvas;
  const random = seededRandom(seed);
  for (let index = 0; index < 1550; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = Math.pow(random(), 1.58) * RADIUS;
    const edge = distance / RADIUS;
    droplet(context, CENTER + Math.cos(angle) * distance, CENTER + Math.sin(angle) * distance,
      0.65 + Math.pow(random(), 2.6) * (3.8 - edge * 1.5),
      0.2 + random() * (0.82 - edge * 0.28), 0.78 + random() * 0.5);
  }
  for (let index = 0; index < 74; index += 1) {
    const angle = random() * Math.PI * 2;
    const distance = RADIUS * (0.7 + Math.pow(random(), 0.72) * 0.43);
    droplet(context, CENTER + Math.cos(angle) * distance, CENTER + Math.sin(angle) * distance,
      1.4 + Math.pow(random(), 1.8) * 6.8, 0.34 + random() * 0.58, 0.52 + random() * 0.9);
  }
  return canvas;
}

function droplet(context: CanvasRenderingContext2D, x: number, y: number, radius: number, opacity: number, stretch: number) {
  context.save();
  context.translate(x, y);
  context.rotate((x * 0.73 + y * 0.41) % Math.PI);
  context.scale(stretch, 1 / Math.max(stretch, 0.3));
  context.fillStyle = `rgba(0,0,0,${Math.min(1, opacity)})`;
  context.beginPath();
  context.arc(0, 0, radius, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function pointSeed(point: Point) {
  let seed = Math.imul(Math.round(point.x * 1_000_000), 0x85ebca6b);
  seed ^= Math.imul(Math.round(point.y * 1_000_000), 0xc2b2ae35);
  return (seed ^ (Math.round(point.at) >>> 0)) >>> 0;
}

function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4_294_967_296;
  };
}
