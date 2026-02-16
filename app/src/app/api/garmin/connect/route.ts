import { NextRequest, NextResponse } from "next/server";
import { connectGarmin } from "@/lib/garmin-service";

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      );
    }

    const result = await connectGarmin(email, password);

    if (result.success) {
      return NextResponse.json({
        connected: true,
        displayName: result.displayName,
      });
    }

    return NextResponse.json(
      { error: result.error || "Connection failed" },
      { status: 401 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
