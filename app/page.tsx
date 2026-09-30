"use client";

import { useEffect, useState } from "react";

type PostureData = {
  id: number;
  posture: string;
  ax: number;
  ay: number;
  az: number;
  bad_duration_ms: number;
  created_at: string;
};

type Statistics = {
  straight: number;
  hunched: number;
  leanLeft: number;
  leanRight: number;
};

export default function Home() {
  const [latest, setLatest] = useState<PostureData | null>(null);

  const [statistics, setStatistics] = useState<Statistics>({
    straight: 0,
    hunched: 0,
    leanLeft: 0,
    leanRight: 0,
  });

  const [error, setError] = useState("");

  async function loadData() {
    try {
      const response = await fetch("/api/posture/latest", {
        cache: "no-store",
      });

      if (!response.ok) {
        throw new Error("API request failed");
      }

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || "API returned an error");
      }

      setLatest(result.latest);
      setStatistics(result.statistics);
      setError("");
    } catch (err) {
      console.error(err);
      setError("ไม่สามารถโหลดข้อมูลจากเซิร์ฟเวอร์");
    }
  }

  useEffect(() => {
    loadData();

    const interval = setInterval(loadData, 2000);

    return () => clearInterval(interval);
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

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <div className="mx-auto max-w-7xl px-6 py-10">

        {/* Header */}
        <header className="mb-8">
          <p className="text-sm font-semibold tracking-widest text-cyan-400">
            IoT WELLNESS SYSTEM
          </p>

          <h1 className="mt-2 text-4xl font-bold">
            Smart Posture Monitor
          </h1>

          <p className="mt-2 text-slate-400">
            ระบบตรวจสอบท่าทางแบบ Real-time
          </p>
        </header>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-red-300">
            {error}
          </div>
        )}

        {/* Current posture */}
        <section className="mb-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-8">

            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">

              <div>
                <p className="text-sm text-slate-400">
                  CURRENT POSTURE
                </p>

                <h2 className="mt-3 text-5xl font-bold">
                  {latest
                    ? postureName(latest.posture)
                    : "กำลังโหลด..."}
                </h2>

                {latest && (
                  <p
                    className={`mt-3 text-sm font-semibold ${
                      postureGood()
                        ? "text-green-400"
                        : "text-red-400"
                    }`}
                  >
                    {postureGood()
                      ? "● GOOD POSTURE"
                      : "● BAD POSTURE"}
                  </p>
                )}
              </div>

              <div className="rounded-xl border border-slate-700 bg-slate-800 px-8 py-5 text-center">
                <p className="text-xs text-slate-400">
                  DEVICE STATUS
                </p>

                <p className="mt-2 font-semibold text-green-400">
                  ● ONLINE
                </p>
              </div>

            </div>
          </div>
        </section>

        {/* Statistics */}
        <section className="mb-6">

          <h2 className="mb-4 text-xl font-semibold">
            Posture Statistics
          </h2>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">

            <StatCard
              title="หลังตรง"
              label="STRAIGHT"
              value={statistics.straight}
            />

            <StatCard
              title="หลังค่อม"
              label="HUNCHED"
              value={statistics.hunched}
            />

            <StatCard
              title="เอียงซ้าย"
              label="LEAN LEFT"
              value={statistics.leanLeft}
            />

            <StatCard
              title="เอียงขวา"
              label="LEAN RIGHT"
              value={statistics.leanRight}
            />

          </div>
        </section>

        {/* Sensor */}
        <section className="mb-6">

          <h2 className="mb-4 text-xl font-semibold">
            MPU6050 Sensor
          </h2>

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

        {/* Bad posture duration */}
        <section className="mb-6">

          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

            <p className="text-sm text-slate-400">
              BAD POSTURE DURATION
            </p>

            <p className="mt-2 text-3xl font-bold">
              {latest
                ? (latest.bad_duration_ms / 1000).toFixed(1)
                : "0.0"}{" "}
              <span className="text-base font-normal text-slate-400">
                seconds
              </span>
            </p>

          </div>
        </section>

        {/* Last update */}
        {latest && (
          <footer className="text-right text-xs text-slate-500">
            Last update:{" "}
            {new Date(latest.created_at).toLocaleString("th-TH")}
          </footer>
        )}

      </div>
    </main>
  );
}

function StatCard({
  title,
  label,
  value,
}: {
  title: string;
  label: string;
  value: number;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

      <p className="text-sm text-slate-400">
        {title}
      </p>

      <p className="mt-3 text-4xl font-bold">
        {value}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        {label}
      </p>

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
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">

      <p className="text-sm text-slate-400">
        {name}
      </p>

      <p className="mt-3 font-mono text-3xl font-bold">
        {value !== undefined
          ? value.toFixed(3)
          : "---"}
      </p>

      <p className="mt-1 text-xs text-slate-500">
        Acceleration (g)
      </p>

    </div>
  );
}