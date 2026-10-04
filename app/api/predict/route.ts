import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Cache-Control": "no-store, max-age=0",
};

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status, headers: corsHeaders });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function POST(request: Request) {
  const baseUrl = process.env.PYTHON_API_URL?.replace(/\/+$/, "");
  if (!baseUrl) return jsonError("Prediction service is not configured", 503);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Request body must be valid JSON", 400);
  }

  try {
    const upstream = await fetch(`${baseUrl}/api/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
    const contentType = upstream.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      return jsonError("Prediction service returned an invalid response", 502);
    }
    const responseBody = await upstream.json();
    return NextResponse.json(responseBody, {
      status: upstream.status,
      headers: corsHeaders,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError") {
      return jsonError("Prediction service timed out", 504);
    }
    return jsonError("Prediction service is unavailable", 502);
  }
}
