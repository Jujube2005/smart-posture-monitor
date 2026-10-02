"use client";

import { useEffect, useRef, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type PostureData = {
  id: number;
  posture: string;
  ax: number;
  ay: number;
  az: number;
  bad_duration_ms: number;
  confidence?: number | null;
  created_at: string;
};

type Statistics = {
  straight: number;
  hunched: number;
  leanLeft: number;
  leanRight: number;
};

type SensorReading = Pick<PostureData, "id" | "ax" | "ay" | "az" | "created_at">;
type HistoryStatus = "loading" | "ready" | "error";
type PeriodStatistics = {
  total: number;
  goodPosture: number;
  badPosture: number;
  postureCounts: Statistics;
};
type Analytics = {
  today: PeriodStatistics;
  last7Days: PeriodStatistics;
};
type BackendStatus = "checking" | "connected" | "unavailable";

const DEVICE_OFFLINE_AFTER_MS = 5000;

export default function Home() {
  const [latest, setLatest] = useState<PostureData | null>(null);
  const [sensorReadings, setSensorReadings] = useState<SensorReading[]>([]);
  const [postureHistory, setPostureHistory] = useState<PostureData[]>([]);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>("loading");
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [backendStatus, setBackendStatus] = useState<BackendStatus>("checking");
  const [currentTime, setCurrentTime] = useState(0);

  const [statistics, setStatistics] = useState<Statistics>({
    straight: 0,
    hunched: 0,
    leanLeft: 0,
    leanRight: 0,
  });

  const [error, setError] = useState("");
  const latestRequestInFlight = useRef(false);
  const analyticsRequestInFlight = useRef(false);

  async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`${url} returned HTTP ${response.status}`);
    }

    return await response.json();
  }

  async function loadData() {
    if (latestRequestInFlight.current) {
      return;
    }

    latestRequestInFlight.current = true;

    try {
      const result = await fetchJson<{
        success: boolean;
        latest: PostureData | null;
        statistics: Statistics;
        message?: string;
      }>("/api/posture/latest");

      if (!result.success) {
        throw new Error(result.message || "API returned an error");
      }

      setLatest(result.latest);
      setStatistics(result.statistics);
      setBackendStatus("connected");
      setSensorReadings((readings) => {
        const newReading = result.latest as PostureData | null;

        if (!newReading || readings.some((reading) => reading.id === newReading.id)) {
          return readings;
        }

        return [...readings, newReading].slice(-30);
      });
      setPostureHistory((records) => {
        const newRecord = result.latest as PostureData | null;

        if (!newRecord || records.some((record) => record.id === newRecord.id)) {
          return records;
        }

        return mergePostureHistory(records, [newRecord]);
      });
      setError("");
    } catch (err) {
      if (!(err instanceof TypeError)) {
        console.error("loadData failed:", err);
      }
      setError("ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์");
      setBackendStatus("unavailable");
    } finally {
      latestRequestInFlight.current = false;
    }
  }

  async function loadAnalytics() {
    if (analyticsRequestInFlight.current) {
      return;
    }

    analyticsRequestInFlight.current = true;

    try {
      const result = await fetchJson<Analytics & {
        success: boolean;
        message?: string;
      }>("/api/posture/statistics");

      if (!result.success) {
        throw new Error(result.message || "Statistics API returned an error");
      }

      setAnalytics(result);
    } catch (err) {
      if (!(err instanceof TypeError)) {
        console.error("loadAnalytics failed:", err);
      }
    } finally {
      analyticsRequestInFlight.current = false;
    }
  }

  async function loadHistory() {
    try {
      const result = await fetchJson<{
        success: boolean;
        history: PostureData[];
        message?: string;
      }>("/api/posture/history");

      if (!result.success || !Array.isArray(result.history)) {
        throw new Error(result.message || "History API returned an error");
      }

      setPostureHistory((records) => mergePostureHistory(records, result.history));
      setHistoryStatus("ready");
    } catch (err) {
      if (!(err instanceof TypeError)) {
        console.error("loadHistory failed:", err);
      }
      setHistoryStatus("error");
    }
  }

  useEffect(() => {
    const initialLoad = window.setTimeout(() => {
      setCurrentTime(Date.now());
      void loadData();
      void loadHistory();
      void loadAnalytics();
    }, 0);

    const postureInterval = window.setInterval(() => {
      void loadData();
    }, 2000);
    const analyticsInterval = window.setInterval(() => {
      void loadAnalytics();
    }, 10000);
    const clockInterval = window.setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(postureInterval);
      window.clearInterval(analyticsInterval);
      window.clearInterval(clockInterval);
    };
    // Pollers intentionally created once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function postureName(posture: string) {
    switch (posture) {
      case "STRAIGHT":
        return "หลังตรง";
      case "HUNCHED":
        return "หลังค่อม";
      case "LEAN LEFT":
        return "เอียงซ้าย";
      case "LEAN RIGHT":
        return "เอียงขวา";
      default:
        return posture;
    }
  }

  function postureGood() {
    return latest?.posture === "STRAIGHT";
  }

  const isGood = postureGood();
  const isBad = latest !== null && !isGood;
  const latestTimestamp = latest ? Date.parse(latest.created_at) : Number.NaN;
  const recordAgeMs = currentTime > 0 && Number.isFinite(latestTimestamp)
    ? Math.max(0, currentTime - latestTimestamp)
    : 0;
  const deviceOnline = Boolean(
    latest && currentTime > 0 && Number.isFinite(latestTimestamp) && recordAgeMs <= DEVICE_OFFLINE_AFTER_MS
  );
  const reportedBadDurationMs = latest ? Math.max(0, latest.bad_duration_ms ?? 0) : 0;
  const badDurationMs = isBad
    ? reportedBadDurationMs + (deviceOnline ? recordAgeMs : 0)
    : 0;
  const badDuration = badDurationMs / 1000;
  const buzzerShouldBeOn = isBad && badDurationMs >= 5000;
  const durationProgress = Math.min((badDurationMs / 5000) * 100, 100);

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#f6f9fd] text-[#102a43]">
      <div className="mx-auto max-w-[1340px] px-4 py-6 sm:px-6 sm:py-9 lg:px-8">

        {/* Header */}
        <header className="mb-7 flex flex-col gap-5 border-b border-[#dce8f5] pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3.5">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#e6f1ff] text-[#1769d4]">
              <PostureIcon className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-semibold tracking-[0.16em] text-[#2675d9]">IOT WELLNESS SYSTEM</p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-[#102a43] sm:text-3xl">Smart Posture Monitor</h1>
              <p className="mt-0.5 text-sm font-medium text-[#64748b]">Real-time IoT Wellness Dashboard</p>
            </div>
          </div>
          <div className={`flex w-fit items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold ${deviceOnline ? "border-[#bee7d2] bg-[#f0fdf5] text-[#168653]" : "border-[#f4d7ac] bg-[#fff9ed] text-[#b76b12]"}`}>
            <span className={`h-2.5 w-2.5 rounded-full ${deviceOnline ? "bg-[#22a566]" : "bg-[#e3a23b]"}`} />
            Device data: {deviceOnline ? "ONLINE" : "OFFLINE"}
          </div>
          <div className="text-right">
            <p className="text-[11px] font-medium text-[#8191a5]">สถานะอ้างอิงจากเวลาของข้อมูลเซ็นเซอร์ล่าสุด</p>
            <p className={`mt-1 text-xs font-semibold ${backendStatus === "connected" ? "text-[#178754]" : backendStatus === "unavailable" ? "text-[#df5734]" : "text-[#8191a5]"}`}>
              Backend API: {backendStatus === "connected" ? "Connected" : backendStatus === "unavailable" ? "Unavailable" : "Checking"}
            </p>
          </div>
        </header>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {/* Current posture */}
        <section className="mb-8">
          <div className={`relative overflow-hidden rounded-3xl border bg-white p-6 shadow-[0_12px_30px_rgba(24,79,135,0.08)] transition-shadow hover:shadow-[0_16px_36px_rgba(24,79,135,0.12)] sm:p-8 ${isGood ? "border-[#cce8dc]" : "border-[#fde0d4]"}`}>
            <div className={`absolute left-0 top-0 h-full w-1.5 ${isGood ? "bg-[#22a566]" : "bg-[#ef6b45]"}`} />
            <div className="flex flex-col gap-7 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-5">
                <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${isGood ? "bg-[#ecfaf2] text-[#1c9b60]" : "bg-[#fff2ed] text-[#e6603a]"}`}>
                  <PostureIcon className="h-8 w-8" />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-[0.14em] text-[#64748b]">AI PREDICTION</p>
                  <h2 className="mt-1.5 text-4xl font-bold tracking-tight text-[#102a43] sm:text-5xl">{latest ? postureName(latest.posture) : "กำลังโหลด..."}</h2>
                  <p className="mt-1 text-sm font-medium text-[#64748b]">{latest?.posture ?? "Awaiting sensor data"}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                {latest && <div className={`flex items-center gap-2.5 rounded-full px-4 py-2.5 text-sm font-bold ${isGood ? "bg-[#ebfaf1] text-[#178754]" : "bg-[#fff0eb] text-[#df5734]"}`}><span className={`h-2.5 w-2.5 rounded-full ${isGood ? "bg-[#22a566]" : "bg-[#ef6b45]"}`} />{isGood ? "GOOD" : "BAD"}</div>}
                <div className="min-w-36 rounded-2xl border border-[#f2e4a7] bg-[#fffbea] px-4 py-3 text-center">
                  <p className="text-[10px] font-bold tracking-[0.12em] text-[#9a7b19]">AI CONFIDENCE</p>
                  <p className="mt-0.5 text-2xl font-bold text-[#846b14]">
                    {typeof latest?.confidence === "number" && Number.isFinite(latest.confidence)
                      ? `${(latest.confidence * 100).toFixed(1)}%`
                      : "Unavailable"}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Statistics */}
        <section className="mb-8">
          <SectionHeading title="Posture Statistics" subtitle="ภาพรวมท่าทางที่ตรวจพบ" />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <StatCard
              title="หลังตรง"
              label="STRAIGHT"
              value={statistics.straight}
              tone="good"
            />

            <StatCard
              title="หลังค่อม"
              label="HUNCHED"
              value={statistics.hunched}
              tone="alert"
            />

            <StatCard
              title="เอียงซ้าย"
              label="LEAN LEFT"
              value={statistics.leanLeft}
              tone="warning"
            />

            <StatCard
              title="เอียงขวา"
              label="LEAN RIGHT"
              value={statistics.leanRight}
              tone="warning"
            />

          </div>
        </section>

        {/* Posture analytics */}
        <section className="mb-8">
          <SectionHeading title="Posture Analytics" subtitle="สรุปข้อมูลจาก Supabase แบบ Real-time" />
          {analytics ? (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <AnalyticsCard title="Today" subtitle="สรุปท่าทางวันนี้" statistics={analytics.today} />
              <AnalyticsCard title="Last 7 Days" subtitle="สรุปท่าทาง 7 วันล่าสุด" statistics={analytics.last7Days} />
            </div>
          ) : (
            <div className="rounded-3xl border border-[#dbe7f3] bg-white px-6 py-10 text-center shadow-[0_8px_24px_rgba(24,79,135,0.06)]">
              <p className="text-sm font-semibold text-[#102a43]">Loading posture analytics</p>
              <p className="mt-1 text-xs font-medium text-[#8191a5]">กำลังวิเคราะห์ข้อมูลท่าทางจากเซ็นเซอร์</p>
            </div>
          )}
        </section>

        {/* Sensor */}
        <section className="mb-8">
          <SectionHeading title="MPU6050 Sensor" subtitle="ข้อมูลความเร่งแบบ Real-time" />

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">

            <SensorCard
              name="AX"
              value={latest?.ax}
            />

            <SensorCard
              name="AY"
              value={latest?.ay}
            />

            <SensorCard
              name="AZ"
              value={latest?.az}
            />

          </div>
        </section>

        {/* Sensor monitoring */}
        <section className="mb-8">
          <SectionHeading title="Sensor Monitoring" subtitle="แนวโน้มค่าเซ็นเซอร์ 30 รายการล่าสุด" />
          <div className="rounded-3xl border border-[#dbe7f3] bg-white p-4 shadow-[0_8px_24px_rgba(24,79,135,0.06)] sm:p-6">
            <div className="mb-5 flex flex-wrap items-center justify-between gap-2 px-1">
              <div>
                <p className="text-sm font-semibold text-[#102a43]">Acceleration history</p>
                <p className="mt-0.5 text-xs font-medium text-[#8191a5]">Real-time readings from MPU6050</p>
              </div>
              <span className="rounded-full bg-[#edf5ff] px-3 py-1.5 text-xs font-semibold text-[#2675d9]">{sensorReadings.length}/30 readings</span>
            </div>
            <div className="h-[300px] w-full sm:h-[360px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={sensorReadings} margin={{ top: 8, right: 8, left: -14, bottom: 0 }}>
                  <CartesianGrid stroke="#e7eef7" strokeDasharray="3 3" vertical={false} />
                  <XAxis
                    dataKey="created_at"
                    tickFormatter={formatChartTime}
                    tick={{ fill: "#718198", fontSize: 11 }}
                    tickLine={false}
                    axisLine={{ stroke: "#dbe7f3" }}
                    minTickGap={32}
                  />
                  <YAxis
                    tick={{ fill: "#718198", fontSize: 11 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(value: number) => value.toFixed(1)}
                    label={{ value: "Acceleration (g)", angle: -90, position: "insideLeft", fill: "#718198", fontSize: 11, dx: -3 }}
                  />
                  <Tooltip content={<SensorTooltip />} cursor={{ stroke: "#b8d7f7", strokeWidth: 1 }} />
                  <Legend wrapperStyle={{ paddingTop: "16px", fontSize: "12px", fontWeight: 600 }} />
                  <Line type="monotone" dataKey="ax" name="AX" stroke="#2675d9" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="ay" name="AY" stroke="#22a566" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="az" name="AZ" stroke="#ef8b32" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </section>

        {/* Posture history */}
        <section className="mb-8">
          <SectionHeading title="Posture History" subtitle="20 รายการล่าสุดจากเซ็นเซอร์" />
          <div className="overflow-hidden rounded-3xl border border-[#dbe7f3] bg-white shadow-[0_8px_24px_rgba(24,79,135,0.06)]">
            {historyStatus === "loading" ? (
              <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf5ff] text-[#2675d9]"><PostureIcon className="h-5 w-5" /></div>
                <p className="mt-3 text-sm font-semibold text-[#102a43]">Waiting for posture records</p>
                <p className="mt-1 text-xs font-medium text-[#8191a5]">ข้อมูลจะแสดงเมื่อเซ็นเซอร์ส่งค่าใหม่</p>
              </div>
            ) : historyStatus === "error" ? (
              <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
                <p className="text-sm font-semibold text-[#102a43]">Unable to load posture history</p>
                <p className="mt-1 text-xs font-medium text-[#8191a5]">โปรดลองใหม่อีกครั้งในภายหลัง</p>
              </div>
            ) : postureHistory.length === 0 ? (
              <div className="flex min-h-40 flex-col items-center justify-center px-6 py-10 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#edf5ff] text-[#2675d9]"><PostureIcon className="h-5 w-5" /></div>
                <p className="mt-3 text-sm font-semibold text-[#102a43]">No posture records yet</p>
                <p className="mt-1 text-xs font-medium text-[#8191a5]">ยังไม่มีข้อมูลในประวัติท่าทาง</p>
              </div>
            ) : (
              <div className="max-h-[360px] overflow-y-auto">
                <div className="hidden grid-cols-[1.15fr_1fr_1fr_1.1fr] gap-4 border-b border-[#e7eef7] bg-[#f9fbfe] px-5 py-3 text-[11px] font-bold tracking-[0.1em] text-[#718198] sm:grid">
                  <span>TIME</span><span>POSTURE</span><span>STATUS</span><span className="text-right">BAD DURATION</span>
                </div>
                {postureHistory.map((record) => {
                  const isGoodRecord = record.posture === "STRAIGHT";
                  return (
                    <div key={record.id} className="grid gap-3 border-b border-[#edf2f7] px-5 py-4 last:border-b-0 sm:grid-cols-[1.15fr_1fr_1fr_1.1fr] sm:items-center sm:gap-4">
                      <div><p className="text-sm font-semibold text-[#102a43]">{formatHistoryTime(record.created_at)}</p><p className="mt-0.5 text-xs font-medium text-[#8191a5]">{formatHistoryDate(record.created_at)}</p></div>
                      <div><p className="text-sm font-semibold text-[#102a43]">{record.posture}</p><p className="mt-0.5 text-xs font-medium text-[#718198]">{postureName(record.posture)}</p></div>
                      <div className={`flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold ${isGoodRecord ? "bg-[#ebfaf1] text-[#178754]" : "bg-[#fff0eb] text-[#df5734]"}`}><span className={`h-1.5 w-1.5 rounded-full ${isGoodRecord ? "bg-[#22a566]" : "bg-[#ef6b45]"}`} />{isGoodRecord ? "GOOD POSTURE" : "BAD POSTURE"}</div>
                      <div className="sm:text-right"><span className="mr-1 text-xs font-medium text-[#8191a5] sm:hidden">Bad duration:</span><span className="text-sm font-semibold text-[#102a43]">{(record.bad_duration_ms / 1000).toFixed(1)} s</span></div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* Bad posture duration */}
        <section className="mb-8 grid gap-4 lg:grid-cols-[1.55fr_1fr]">
          <div className="rounded-3xl border border-[#f7d9cf] bg-white p-6 shadow-[0_8px_24px_rgba(24,79,135,0.06)] sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold tracking-[0.14em] text-[#64748b]">BAD POSTURE DURATION</p>
                <p className="mt-2 text-3xl font-bold text-[#102a43] sm:text-4xl">{badDuration.toFixed(1)} <span className="text-base font-medium text-[#64748b]">/ 5.0 sec</span></p>
              </div>
              <span className={`rounded-full px-3 py-1.5 text-xs font-bold ${buzzerShouldBeOn ? "bg-[#fff0eb] text-[#df5734]" : isGood ? "bg-[#ebfaf1] text-[#178754]" : "bg-[#fff9ed] text-[#b76b12]"}`}>
                {buzzerShouldBeOn ? "BUZZER SHOULD BE ON" : isGood ? "GOOD · TIMER RESET" : "Threshold at 5 seconds"}
              </span>
            </div>
            <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-[#fbe7e1]"><div className={`h-full transition-all duration-500 ${buzzerShouldBeOn ? "bg-[#df5734]" : "bg-[#e3a23b]"}`} style={{ width: `${durationProgress}%` }} /></div>
            <div className="mt-2 flex justify-between text-xs font-medium text-[#8191a5]"><span>0s</span><span>5s alert threshold</span></div>
          </div>
          <div className="rounded-3xl border border-[#dbe7f3] bg-white p-6 shadow-[0_8px_24px_rgba(24,79,135,0.06)] sm:p-7">
            <p className="text-xs font-semibold tracking-[0.14em] text-[#64748b]">LAST UPDATE</p>
            <p className="mt-3 text-base font-semibold leading-relaxed text-[#102a43]">{latest ? new Date(latest.created_at).toLocaleString("th-TH") : "กำลังรอข้อมูล..."}</p>
            <p className="mt-2 text-xs font-medium text-[#2675d9]">Auto-refresh every 2 seconds</p>
          </div>
        </section>

      </div>
    </main>
  );
}

function StatCard({
  title,
  label,
  value,
  tone,
}: {
  title: string;
  label: string;
  value: number;
  tone: "good" | "alert" | "warning";
}) {
  const style = tone === "good" ? "bg-[#ebfaf1] text-[#1c9b60]" : tone === "alert" ? "bg-[#fff0eb] text-[#e6603a]" : "bg-[#fff6e8] text-[#dd8824]";
  return (
    <div className="rounded-2xl border border-[#dbe7f3] bg-white p-5 shadow-[0_6px_18px_rgba(24,79,135,0.05)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-[0_10px_22px_rgba(24,79,135,0.09)]">
      <div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-[#102a43]">{title}</p><p className="mt-0.5 text-xs font-medium text-[#718198]">{label}</p></div><div className={`flex h-9 w-9 items-center justify-center rounded-xl ${style}`}><PostureIcon className="h-4 w-4" /></div></div>
      <p className="mt-5 text-4xl font-bold tracking-tight text-[#102a43]">{value}</p>
      <p className="mt-1 text-xs font-medium text-[#8191a5]">ครั้งที่ตรวจพบ</p>
    </div>
  );
}

function SensorCard({
  name,
  value,
}: {
  name: string;
  value?: number;
}) {
  return (
    <div className="rounded-2xl border border-[#dbe7f3] bg-white p-6 shadow-[0_6px_18px_rgba(24,79,135,0.05)]">
      <div className="flex items-center justify-between"><p className="text-sm font-bold text-[#102a43]">{name}</p><span className="rounded-lg bg-[#edf5ff] px-2 py-1 text-[10px] font-bold tracking-wider text-[#2675d9]">ACCEL</span></div>
      <p className="mt-4 font-mono text-3xl font-bold tracking-tight text-[#102a43]">{value !== undefined ? value.toFixed(3) : "---"}</p>
      <p className="mt-1 text-xs font-medium text-[#8191a5]">Acceleration (g)</p>
    </div>
  );
}

function mergePostureHistory(current: PostureData[], incoming: PostureData[]) {
  const uniqueRecords = new Map<number, PostureData>();

  for (const record of [...current, ...incoming]) {
    uniqueRecords.set(record.id, record);
  }

  return [...uniqueRecords.values()]
    .sort((first, second) => new Date(second.created_at).getTime() - new Date(first.created_at).getTime())
    .slice(0, 20);
}

function AnalyticsCard({
  title,
  subtitle,
  statistics,
}: {
  title: string;
  subtitle: string;
  statistics: PeriodStatistics;
}) {
  const goodPercentage = statistics.total > 0
    ? Math.round((statistics.goodPosture / statistics.total) * 100)
    : 0;

  return (
    <div className="rounded-3xl border border-[#dbe7f3] bg-white p-5 shadow-[0_8px_24px_rgba(24,79,135,0.06)] sm:p-6">
      <div className="flex items-start justify-between gap-4">
        <div><p className="text-lg font-bold text-[#102a43]">{title}</p><p className="mt-0.5 text-xs font-medium text-[#718198]">{subtitle}</p></div>
        <div className="rounded-2xl bg-[#edf5ff] px-3 py-2 text-right"><p className="text-xl font-bold text-[#2675d9]">{goodPercentage}%</p><p className="text-[10px] font-bold tracking-wide text-[#4a7ebd]">GOOD POSTURE</p></div>
      </div>
      <div className="mt-5 h-2.5 overflow-hidden rounded-full bg-[#fbe7e1]"><div className="h-full rounded-full bg-[#22a566] transition-all duration-500" style={{ width: `${goodPercentage}%` }} /></div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        <AnalyticsMetric label="Total records" value={statistics.total} tone="navy" />
        <AnalyticsMetric label="Good posture" value={statistics.goodPosture} tone="good" />
        <AnalyticsMetric label="Bad posture" value={statistics.badPosture} tone="bad" />
      </div>
      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-2 border-t border-[#edf2f7] pt-4 text-xs font-medium text-[#718198] sm:grid-cols-4">
        <span>STRAIGHT <b className="ml-1 text-[#178754]">{statistics.postureCounts.straight}</b></span>
        <span>HUNCHED <b className="ml-1 text-[#df5734]">{statistics.postureCounts.hunched}</b></span>
        <span>LEAN LEFT <b className="ml-1 text-[#df5734]">{statistics.postureCounts.leanLeft}</b></span>
        <span>LEAN RIGHT <b className="ml-1 text-[#df5734]">{statistics.postureCounts.leanRight}</b></span>
      </div>
    </div>
  );
}

function AnalyticsMetric({ label, value, tone }: { label: string; value: number; tone: "navy" | "good" | "bad" }) {
  const color = tone === "good" ? "text-[#178754]" : tone === "bad" ? "text-[#df5734]" : "text-[#102a43]";
  return <div><p className={`text-2xl font-bold tracking-tight ${color}`}>{value}</p><p className="mt-1 text-[11px] font-medium leading-tight text-[#8191a5]">{label}</p></div>;
}

function SectionHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-1"><h2 className="text-xl font-bold tracking-tight text-[#102a43]">{title}</h2><p className="text-sm font-medium text-[#718198]">{subtitle}</p></div>;
}

function formatChartTime(value: string) {
  return new Date(value).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatHistoryTime(value: string) {
  return new Date(value).toLocaleTimeString("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatHistoryDate(value: string) {
  return new Date(value).toLocaleDateString("th-TH", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function SensorTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ color: string; name: string; value: number }>;
  label?: string;
}) {
  if (!active || !payload?.length || !label) return null;

  return (
    <div className="rounded-xl border border-[#dbe7f3] bg-white px-3.5 py-3 shadow-lg">
      <p className="mb-2 text-xs font-semibold text-[#64748b]">{new Date(label).toLocaleString("th-TH")}</p>
      <div className="space-y-1.5">
        {payload.map((item) => (
          <p key={item.name} className="flex items-center justify-between gap-5 text-xs font-semibold text-[#102a43]">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}</span>
            <span>{Number(item.value).toFixed(3)} g</span>
          </p>
        ))}
      </div>
    </div>
  );
}

function PostureIcon({ className }: { className?: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className} aria-hidden="true"><circle cx="12" cy="5" r="2.5" /><path d="M12 8v6m0 0 4 7m-4-7-4 7m4-11 4 3m-4-3-4 3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
