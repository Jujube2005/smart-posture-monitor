import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

const validPostures = new Set(["STRAIGHT", "HUNCHED", "LEAN LEFT", "LEAN RIGHT"]);
const pageSize = 1000;

type DatasetRow = {
  ax: number | null;
  ay: number | null;
  az: number | null;
  posture: string | null;
  created_at: string;
};

function isValidDatasetRow(row: DatasetRow): row is Required<DatasetRow> {
  return (
    typeof row.ax === "number" &&
    Number.isFinite(row.ax) &&
    typeof row.ay === "number" &&
    Number.isFinite(row.ay) &&
    typeof row.az === "number" &&
    Number.isFinite(row.az) &&
    typeof row.posture === "string" &&
    validPostures.has(row.posture)
  );
}

export async function GET() {
  try {
    const dataset: DatasetRow[] = [];
    let from = 0;

    while (true) {
      const { data, error } = await supabase
        .from("posture_data")
        .select("ax, ay, az, posture, created_at")
        .order("created_at", { ascending: true })
        .range(from, from + pageSize - 1);

      if (error) {
        throw error;
      }

      const rows = (data ?? []) as DatasetRow[];
      dataset.push(...rows);

      if (rows.length < pageSize) {
        break;
      }

      from += pageSize;
    }

    const validDataset = dataset.filter(isValidDatasetRow);

    return NextResponse.json({
      success: true,
      count: validDataset.length,
      data: validDataset,
    });
  } catch (error) {
    console.error("AI dataset export error:", error);

    return NextResponse.json(
      {
        success: false,
        message: "Failed to export AI dataset",
      },
      { status: 500 }
    );
  }
}
