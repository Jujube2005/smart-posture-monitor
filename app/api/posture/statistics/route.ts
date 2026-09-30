import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

type PostureRow = {
  posture: string;
  created_at: string;
};

type PeriodStatistics = {
  total: number;
  goodPosture: number;
  badPosture: number;
  postureCounts: {
    straight: number;
    hunched: number;
    leanLeft: number;
    leanRight: number;
  };
};

function startOfBangkokDay(date: Date) {
  const bangkokOffset = 7 * 60 * 60 * 1000;
  const bangkokDate = new Date(date.getTime() + bangkokOffset);
  bangkokDate.setUTCHours(0, 0, 0, 0);

  return new Date(bangkokDate.getTime() - bangkokOffset);
}

function calculateStatistics(rows: PostureRow[]): PeriodStatistics {
  const postureCounts = {
    straight: 0,
    hunched: 0,
    leanLeft: 0,
    leanRight: 0,
  };

  for (const row of rows) {
    if (row.posture === "STRAIGHT") postureCounts.straight++;
    else if (row.posture === "HUNCHED") postureCounts.hunched++;
    else if (row.posture === "LEAN LEFT") postureCounts.leanLeft++;
    else if (row.posture === "LEAN RIGHT") postureCounts.leanRight++;
  }

  const goodPosture = postureCounts.straight;
  const badPosture = postureCounts.hunched + postureCounts.leanLeft + postureCounts.leanRight;

  return {
    total: goodPosture + badPosture,
    goodPosture,
    badPosture,
    postureCounts,
  };
}

export async function GET() {
  try {
    const todayStart = startOfBangkokDay(new Date());
    const last7DaysStart = new Date(todayStart);
    last7DaysStart.setUTCDate(last7DaysStart.getUTCDate() - 6);

    const { data, error } = await supabase
      .from("posture_data")
      .select("posture, created_at")
      .gte("created_at", last7DaysStart.toISOString())
      .order("created_at", { ascending: false });

    if (error) {
      throw error;
    }

    const last7DaysRows = (data ?? []) as PostureRow[];
    const todayRows = last7DaysRows.filter(
      (row) => new Date(row.created_at).getTime() >= todayStart.getTime()
    );

    return NextResponse.json({
      success: true,
      today: calculateStatistics(todayRows),
      last7Days: calculateStatistics(last7DaysRows),
    });
  } catch (error) {
    console.error("Posture statistics error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to get posture statistics",
      },
      { status: 500 }
    );
  }
}
