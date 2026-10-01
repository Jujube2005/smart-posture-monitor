import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

export const dynamic = "force-dynamic";

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

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const PAGE_SIZE = 1000;

function startOfBangkokDay(date: Date) {
  // Shift to Bangkok wall time, find midnight there, then convert back to UTC.
  const bangkokDate = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  bangkokDate.setUTCHours(0, 0, 0, 0);
  return new Date(bangkokDate.getTime() - BANGKOK_OFFSET_MS);
}

async function fetchPostureRows(from: Date, until: Date): Promise<PostureRow[]> {
  const rows: PostureRow[] = [];

  // Supabase/PostgREST responses are capped (commonly at 1,000 rows). Fetch
  // every page so newer records and larger periods are fully counted.
  for (let offset = 0; ; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("posture_data")
      .select("posture, created_at")
      .gte("created_at", from.toISOString())
      .lt("created_at", until.toISOString())
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;

    const page = (data ?? []) as PostureRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function calculateStatistics(rows: PostureRow[]): PeriodStatistics {
  const postureCounts = {
    straight: 0,
    hunched: 0,
    leanLeft: 0,
    leanRight: 0,
  };

  for (const row of rows) {
    const posture = row.posture.trim().toUpperCase();
    if (posture === "STRAIGHT") postureCounts.straight++;
    else if (posture === "HUNCHED") postureCounts.hunched++;
    else if (posture === "LEAN LEFT") postureCounts.leanLeft++;
    else if (posture === "LEAN RIGHT") postureCounts.leanRight++;
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
    const tomorrowStart = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
    const last7DaysStart = new Date(todayStart);
    last7DaysStart.setUTCDate(last7DaysStart.getUTCDate() - 6);

    // Use Bangkok calendar-day boundaries converted to ISO UTC timestamps.
    // The upper bound is exclusive, covering through 23:59:59.999... local.
    const last7DaysRows = await fetchPostureRows(last7DaysStart, tomorrowStart);
    const todayRows = await fetchPostureRows(todayStart, tomorrowStart);

    return NextResponse.json(
      {
        success: true,
        today: calculateStatistics(todayRows),
        last7Days: calculateStatistics(last7DaysRows),
      },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("Posture statistics error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to get posture statistics",
      },
      { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  }
}
