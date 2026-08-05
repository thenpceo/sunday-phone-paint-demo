import {
  createPaintSession,
  joinPhone,
  markComplete,
  readPaintSession,
  updateCursor,
  updateTracking,
  type SessionSnapshot,
} from "@/app/lib/session-store";

export const dynamic = "force-dynamic";

const TOKEN_PATTERN = /^[a-f0-9]{32}$/;
const TRACKING_STATES = new Set(["waiting", "found", "lost", "manual"]);

function validOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function tokenFrom(request: Request) {
  const token = request.headers.get("x-paint-session") ?? "";
  return TOKEN_PATTERN.test(token) ? token : null;
}

function json(payload: unknown, status = 200) {
  return Response.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const session = await createPaintSession();
  const requestOrigin = new URL(request.url).origin;
  const origin = validOrigin(process.env.PHONE_PAINT_PUBLIC_ORIGIN) ?? requestOrigin;
  return json({ ...session, phoneUrl: `${origin}/phone?session=${session.token}` }, 201);
}

export async function GET(request: Request) {
  const token = tokenFrom(request);
  if (!token) return json({ error: "SESSION_INVALID" }, 400);
  const session = await readPaintSession(token);
  return session ? json({ session }) : json({ error: "SESSION_EXPIRED" }, 410);
}

type PatchBody =
  | { type: "join" }
  | { type: "tracking"; tracking: SessionSnapshot["tracking"] }
  | { type: "cursor"; seq: number; x: number; y: number; tracking: SessionSnapshot["tracking"] }
  | { type: "complete" };

export async function PATCH(request: Request) {
  const token = tokenFrom(request);
  if (!token) return json({ error: "SESSION_INVALID" }, 400);
  let body: PatchBody;
  try {
    body = (await request.json()) as PatchBody;
  } catch {
    return json({ error: "PROTOCOL_INVALID" }, 400);
  }

  let updated = false;
  if (body.type === "join") updated = await joinPhone(token);
  else if (body.type === "complete") updated = await markComplete(token);
  else if (body.type === "tracking" && TRACKING_STATES.has(body.tracking)) {
    updated = await updateTracking(token, body.tracking);
  } else if (
    body.type === "cursor" &&
    Number.isSafeInteger(body.seq) && body.seq >= 0 &&
    Number.isFinite(body.x) && body.x >= 0 && body.x <= 1 &&
    Number.isFinite(body.y) && body.y >= 0 && body.y <= 1 &&
    TRACKING_STATES.has(body.tracking)
  ) {
    updated = await updateCursor(token, body);
  } else return json({ error: "PROTOCOL_INVALID" }, 400);

  return updated ? json({ ok: true }) : json({ error: "SESSION_EXPIRED" }, 410);
}
