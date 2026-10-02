import { NextResponse } from "next/server";
import { predictAndSavePosture } from "@/lib/save-prediction";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let data: unknown;
  try {
    data = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, message: "Invalid JSON" },
      { status: 400 }
    );
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return NextResponse.json(
      { success: false, message: "Invalid posture data" },
      { status: 400 }
    );
  }

  const { ax, ay, az } = data as Record<string, unknown>;
  if (
    typeof ax !== "number" || !Number.isFinite(ax) ||
    typeof ay !== "number" || !Number.isFinite(ay) ||
    typeof az !== "number" || !Number.isFinite(az)
  ) {
    return NextResponse.json(
      { success: false, message: "ax, ay, and az must be finite numbers" },
      { status: 400 }
    );
  }

  try {
    const saved = await predictAndSavePosture([ax, ay, az]);
    console.log("AI POSTURE DATA SAVED:", saved.data);

    return NextResponse.json({
      success: true,
      message: "Posture data saved",
      data: saved.data,
    });
  } catch (error) {
    console.error("Posture prediction/save error:", error);
    return NextResponse.json(
      {
        success: false,
        message: "Failed to predict or save posture data",
      },
      { status: 503 }
    );
  }
}
