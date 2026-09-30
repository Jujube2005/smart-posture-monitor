import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

export async function GET() {
  try {
    const { data: history, error } = await supabase
      .from("posture_data")
      .select("id, posture, ax, ay, az, bad_duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      history: history ?? [],
    });
  } catch (error) {
    console.error("Posture history error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to get posture history",
      },
      { status: 500 }
    );
  }
}
