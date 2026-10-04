import { createClient } from "@supabase/supabase-js";
import { predictPosture } from "@/lib/prediction-worker";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !supabaseSecretKey) {
  throw new Error("Supabase environment variables are missing");
}

const supabase = createClient(supabaseUrl, supabaseSecretKey);

export async function predictAndSavePosture(
  values: [number, number, number],
  reportedBadDurationMs?: number
) {
  const { posture, confidence } = predictPosture(values);

  let badDurationMs = reportedBadDurationMs ?? 0;
  if (reportedBadDurationMs === undefined && posture !== "STRAIGHT") {
    const { data: previous, error: previousError } = await supabase
      .from("posture_data")
      .select("posture, bad_duration_ms, created_at")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousError) throw previousError;
    if (previous && previous.posture !== "STRAIGHT") {
      const elapsedMs = Date.now() - new Date(previous.created_at).getTime();
      // Continue only across a live sensor stream; a stale gap starts a new run.
      if (elapsedMs > 0 && elapsedMs <= 5000) {
        badDurationMs = Math.max(0, previous.bad_duration_ms) + elapsedMs;
      }
    }
  }

  const { data, error } = await supabase
    .from("posture_data")
    .insert({
      posture,
      confidence,
      ax: values[0],
      ay: values[1],
      az: values[2],
      bad_duration_ms: posture === "STRAIGHT" ? 0 : badDurationMs,
    })
    .select()
    .single();

  if (error) throw error;
  return { posture, confidence, data };
}
