import { NextResponse } from "next/server";
import { requireJsonRequest } from "@/lib/security/guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rejected = requireJsonRequest(request);
  if (rejected) return rejected;
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  // A shutdown action is available only to the local app's own browser page.
  if (!origin || !host || !/^127\.0\.0\.1:\d+$|^localhost:\d+$/.test(host)) {
    return NextResponse.json({ error: "Quit is available only from the local Serpo window." }, { status: 403 });
  }
  const port = Number(process.env.SERPO_CONTROL_PORT);
  const token = process.env.SERPO_CONTROL_TOKEN;
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !token) {
    return NextResponse.json({ error: "This session was started with the old launcher. Close it once, then open Serpo from the updated shortcut to enable Quit." }, { status: 409 });
  }
  try {
    const response = await fetch(`http://127.0.0.1:${port}/quit`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(3000) });
    if (!response.ok) throw new Error("The Serpo launcher could not accept the shutdown request.");
    return NextResponse.json({ stopping: true });
  } catch {
    return NextResponse.json({ error: "Could not reach the Serpo launcher. The app has not confirmed shutdown." }, { status: 503 });
  }
}
