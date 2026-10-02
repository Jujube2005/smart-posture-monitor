import { NextResponse } from "next/server";
import { isPostureModelAvailable } from "@/lib/prediction-worker";
import { predictAndSavePosture } from "@/lib/save-prediction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, max-age=0",
};
const allowedPostures = new Set([
  "STRAIGHT",
  "HUNCHED",
  "LEAN LEFT",
  "LEAN RIGHT",
]);

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: corsHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  if (!isPostureModelAvailable()) {
    return jsonError("Prediction model posture_model.joblib was not found", 503);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return jsonError("Request body must be a JSON object", 400);
  }

  const input = body as Record<string, unknown>;
  const values = [input.ax, input.ay, input.az];
  if (values.some((value) => typeof value !== "number" || !Number.isFinite(value))) {
    return jsonError("ax, ay, and az are required finite numbers", 400);
  }

  const sensorPosture = input.sensor_posture ?? input.posture;
  if (sensorPosture !== undefined &&
      (typeof sensorPosture !== "string" || !allowedPostures.has(sensorPosture))) {
    return jsonError("sensor_posture must be a supported posture label", 400);
  }

  if (input.bad_duration_ms !== undefined &&
      (typeof input.bad_duration_ms !== "number" ||
       !Number.isFinite(input.bad_duration_ms) || input.bad_duration_ms < 0)) {
    return jsonError("bad_duration_ms must be a non-negative finite number", 400);
  }

  try {
    const result = await predictAndSavePosture(values as [number, number, number]);
    return NextResponse.json(
      {
        posture: result.posture,
        confidence: result.confidence,
        ...(sensorPosture ? { sensor_posture: sensorPosture } : {}),
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    console.error("Posture prediction error:", error);
    return jsonError("Prediction or database save failed", 503);
  }
}
