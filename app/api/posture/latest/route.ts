import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(
  supabaseUrl,
  supabaseSecretKey
);

export async function GET() {
  try {
    // ข้อมูลล่าสุด
    const { data: latest, error: latestError } = await supabase
      .from("posture_data")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (latestError) {
      throw latestError;
    }

    // ดึงข้อมูลทั้งหมดสำหรับคำนวณสถิติ
    const { data: allData, error: allDataError } = await supabase
      .from("posture_data")
      .select("posture");

    if (allDataError) {
      throw allDataError;
    }

    const statistics = {
      straight: 0,
      hunched: 0,
      leanLeft: 0,
      leanRight: 0,
    };

    for (const row of allData ?? []) {
      if (row.posture === "STRAIGHT") {
        statistics.straight++;
      } else if (row.posture === "HUNCHED") {
        statistics.hunched++;
      } else if (row.posture === "LEAN LEFT") {
        statistics.leanLeft++;
      } else if (row.posture === "LEAN RIGHT") {
        statistics.leanRight++;
      }
    }

    return NextResponse.json({
      success: true,
      latest,
      statistics,
    });
  } catch (error) {
    console.error("Latest posture error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to get posture data",
      },
      { status: 500 }
    );
  }
}