import { randomBytes } from "node:crypto";
import { Redis } from "@upstash/redis";

export type TrackingState = "waiting" | "found" | "lost" | "manual";

export type SessionSnapshot = {
  phoneConnected: boolean;
  latestSeq: number;
  latestX: number | null;
  latestY: number | null;
  tracking: TrackingState;
  completed: boolean;
  updatedAt: number;
  expiresAt: number;
};

type SessionRecord = SessionSnapshot & { token: string };

const SESSION_TTL = 30 * 60 * 1000;
const SESSION_TTL_SECONDS = SESSION_TTL / 1000;
const KEY_PREFIX = "phone-paint:session:";
// Prefer Upstash's native REST credentials. The Vercel Marketplace KV aliases
// remain supported as a fallback for projects where that binding is healthy.
const redisUrl = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = redisUrl && redisToken ? new Redis({ url: redisUrl, token: redisToken }) : null;
const shared = globalThis as typeof globalThis & { __phonePaintSessions?: Map<string, SessionRecord> };
const sessions = shared.__phonePaintSessions ?? new Map<string, SessionRecord>();
shared.__phonePaintSessions = sessions;

const UPDATE_FIELDS = `
if redis.call("EXISTS", KEYS[1]) == 0 then return 0 end
redis.call("HSET", KEYS[1], unpack(ARGV))
return 1
`;

const UPDATE_CURSOR = `
if redis.call("EXISTS", KEYS[1]) == 0 then return 0 end
local current = tonumber(redis.call("HGET", KEYS[1], "latestSeq")) or -1
if tonumber(ARGV[2]) < current then return 1 end
redis.call("HSET", KEYS[1], unpack(ARGV))
return 1
`;

function key(token: string) {
  return `${KEY_PREFIX}${token}`;
}

function numberValue(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function booleanValue(value: unknown) {
  return value === true || value === 1 || value === "1" || value === "true";
}

function recordValue(value: Record<string, unknown> | null): SessionRecord | null {
  if (!value?.token) return null;
  const tracking = ["waiting", "found", "lost", "manual"].includes(String(value.tracking))
    ? value.tracking as TrackingState
    : "waiting";
  return {
    token: String(value.token),
    phoneConnected: booleanValue(value.phoneConnected),
    latestSeq: numberValue(value.latestSeq, -1),
    latestX: value.latestX === null || value.latestX === "null" ? null : numberValue(value.latestX, 0),
    latestY: value.latestY === null || value.latestY === "null" ? null : numberValue(value.latestY, 0),
    tracking,
    completed: booleanValue(value.completed),
    updatedAt: numberValue(value.updatedAt, Date.now()),
    expiresAt: numberValue(value.expiresAt, 0),
  };
}

async function current(token: string) {
  if (redis) {
    const session = recordValue(await redis.hgetall<Record<string, unknown>>(key(token)));
    if (!session) return null;
    if (session.expiresAt <= Date.now()) {
      await redis.del(key(token));
      return null;
    }
    return session;
  }
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  return session;
}

function snapshot(session: SessionRecord): SessionSnapshot {
  return {
    phoneConnected: session.phoneConnected,
    latestSeq: session.latestSeq,
    latestX: session.latestX,
    latestY: session.latestY,
    tracking: session.tracking,
    completed: session.completed,
    updatedAt: session.updatedAt,
    expiresAt: session.expiresAt,
  };
}

async function updateFields(token: string, fields: Record<string, string | number | boolean>) {
  if (redis) {
    const args = Object.entries(fields).flatMap(([field, value]) => [field, String(value)]);
    return await redis.eval<string[], number>(UPDATE_FIELDS, [key(token)], args) === 1;
  }
  const session = await current(token);
  if (!session) return false;
  Object.assign(session, fields);
  return true;
}

export async function createPaintSession() {
  const token = randomBytes(16).toString("hex");
  const now = Date.now();
  const session: SessionRecord = {
    token,
    phoneConnected: false,
    latestSeq: -1,
    latestX: null,
    latestY: null,
    tracking: "waiting",
    completed: false,
    updatedAt: now,
    expiresAt: now + SESSION_TTL,
  };
  if (redis) {
    await redis.pipeline()
      .hset(key(token), session)
      .expire(key(token), SESSION_TTL_SECONDS)
      .exec();
  } else sessions.set(token, session);
  return { token, expiresAt: session.expiresAt };
}

export async function readPaintSession(token: string) {
  const session = await current(token);
  return session ? snapshot(session) : null;
}

export function joinPhone(token: string) {
  return updateFields(token, { phoneConnected: true, updatedAt: Date.now() });
}

export function updateTracking(token: string, tracking: TrackingState) {
  return updateFields(token, { tracking, updatedAt: Date.now() });
}

export async function updateCursor(
  token: string,
  cursor: { seq: number; x: number; y: number; tracking: TrackingState },
) {
  if (redis) {
    const args = [
      "latestSeq", String(cursor.seq),
      "latestX", String(cursor.x),
      "latestY", String(cursor.y),
      "tracking", cursor.tracking,
      "updatedAt", String(Date.now()),
    ];
    return await redis.eval<string[], number>(UPDATE_CURSOR, [key(token)], args) === 1;
  }
  const session = await current(token);
  if (!session) return false;
  if (cursor.seq < session.latestSeq) return true;
  session.latestSeq = cursor.seq;
  session.latestX = cursor.x;
  session.latestY = cursor.y;
  session.tracking = cursor.tracking;
  session.updatedAt = Date.now();
  return true;
}

export function markComplete(token: string) {
  return updateFields(token, { completed: true, updatedAt: Date.now() });
}
