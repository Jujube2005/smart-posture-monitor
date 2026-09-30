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

export async function POST(request: Request) {
  try {
    const data = await request.json();

    const {
      posture,
      ax,
      ay,
      az,
      bad_duration_ms,
    } = data;

    // ตรวจข้อมูลที่จำเป็น
    if (
      typeof posture !== "string" ||
      typeof ax !== "number" ||
      typeof ay !== "number" ||
      typeof az !== "number"
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid posture data",
        },
        { status: 400 }
      );
    }

    const { data: insertedData, error } = await supabase
      .from("posture_data")
      .insert({
        posture,
        ax,
        ay,
        az,
        bad_duration_ms: bad_duration_ms ?? 0,
      })
      .select()
      .single();

    if (error) {
      console.error("Supabase error:", error);

      return NextResponse.json(
        {
          success: false,
          message: "Failed to save posture data",
          error: error.message,
        },
        { status: 500 }
      );
    }

    console.log("POSTURE DATA SAVED:", insertedData);

    return NextResponse.json({
      success: true,
      message: "Posture data saved",
      data: insertedData,
    });
  } catch (error) {
    console.error("Request error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Invalid JSON",
      },
      { status: 400 }
    );
  }
}