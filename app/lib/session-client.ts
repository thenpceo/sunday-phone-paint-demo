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

export async function readSession(token: string, signal?: AbortSignal) {
  const response = await fetch("/api/session", {
    headers: { "x-paint-session": token },
    cache: "no-store",
    signal,
  });
  if (!response.ok) throw new Error(response.status === 410 ? "SESSION_EXPIRED" : "SESSION_READ_FAILED");
  return (await response.json()) as { session: SessionSnapshot };
}

export async function updateSession(token: string, payload: object) {
  const response = await fetch("/api/session", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "x-paint-session": token },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(response.status === 410 ? "SESSION_EXPIRED" : "SESSION_UPDATE_FAILED");
}
