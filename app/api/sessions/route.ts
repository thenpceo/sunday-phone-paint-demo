import { createPaintSession } from "@/app/lib/session-store";

export const dynamic = "force-dynamic";

function validOrigin(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const session = await createPaintSession();
  const requestOrigin = new URL(request.url).origin;
  const origin = validOrigin(process.env.PHONE_PAINT_PUBLIC_ORIGIN) ?? requestOrigin;
  return Response.json(
    { ...session, phoneUrl: `${origin}/phone?session=${session.token}` },
    { status: 201, headers: { "Cache-Control": "no-store" } },
  );
}
