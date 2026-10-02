import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

export type Prediction = { posture: string; confidence: number };

type PendingRequest = {
  resolve: (prediction: Prediction) => void;
  reject: (error: Error) => void;
  timeout: NodeJS.Timeout;
};
type WorkerState = {
  child: ChildProcessWithoutNullStreams;
  ready: Promise<void>;
  resolveReady: () => void;
  rejectReady: (error: Error) => void;
  isReady: boolean;
  nextId: number;
  pending: Map<number, PendingRequest>;
};

const MODEL_PATH = path.join(process.cwd(), "posture_model.joblib");
const WORKER_PATH = path.join(process.cwd(), "predict.py");
const REQUEST_TIMEOUT_MS = 10_000;
const workerGlobal = globalThis as typeof globalThis & {
  posturePredictionWorker?: WorkerState;
};

export function isPostureModelAvailable() {
  return existsSync(MODEL_PATH);
}

function failWorker(state: WorkerState, error: Error) {
  if (workerGlobal.posturePredictionWorker === state) {
    workerGlobal.posturePredictionWorker = undefined;
  }
  if (!state.isReady) state.rejectReady(error);
  for (const pending of state.pending.values()) {
    clearTimeout(pending.timeout);
    pending.reject(error);
  }
  state.pending.clear();
}

function getWorker(): WorkerState {
  const existing = workerGlobal.posturePredictionWorker;
  if (existing && !existing.child.killed && existing.child.exitCode === null) return existing;

  const configuredPython = process.env.PYTHON_EXECUTABLE;
  const pythonExecutable = configuredPython || (process.platform === "win32" ? "py" : "python3");
  const pythonArgs = configuredPython
    ? [WORKER_PATH, "--server"]
    : process.platform === "win32"
      ? ["-3", WORKER_PATH, "--server"]
      : [WORKER_PATH, "--server"];
  const child = spawn(/* turbopackIgnore: true */ pythonExecutable, pythonArgs, {
    stdio: ["pipe", "pipe", "pipe"],
  });

  let resolveReady!: () => void;
  let rejectReady!: (error: Error) => void;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const state: WorkerState = {
    child,
    ready,
    resolveReady,
    rejectReady,
    isReady: false,
    nextId: 1,
    pending: new Map(),
  };
  workerGlobal.posturePredictionWorker = state;

  const output = createInterface({ input: child.stdout });
  output.on("line", (line) => {
    let message: { ready?: boolean; id?: number; posture?: string; confidence?: number; error?: string };
    try {
      message = JSON.parse(line);
    } catch {
      failWorker(state, new Error("Prediction worker returned invalid JSON"));
      child.kill();
      return;
    }

    if (message.ready === true && !state.isReady) {
      state.isReady = true;
      state.resolveReady();
      return;
    }

    if (typeof message.id !== "number") return;
    const pending = state.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timeout);
    state.pending.delete(message.id);

    if (message.error) {
      pending.reject(new Error(message.error));
    } else if (typeof message.posture === "string" && typeof message.confidence === "number") {
      pending.resolve({ posture: message.posture, confidence: message.confidence });
    } else {
      pending.reject(new Error("Prediction worker returned an incomplete response"));
    }
  });

  let stderr = "";
  child.stderr.on("data", (chunk: Buffer) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });
  child.once("error", (error) => failWorker(state, error));
  child.once("exit", (code, signal) => {
    const detail = stderr.trim() || `code ${code ?? "unknown"}, signal ${signal ?? "none"}`;
    failWorker(state, new Error(`Prediction worker stopped: ${detail}`));
  });

  return state;
}

export async function predictPosture(values: [number, number, number]): Promise<Prediction> {
  const state = getWorker();
  await state.ready;

  const id = state.nextId++;
  return new Promise<Prediction>((resolve, reject) => {
    const timeout = setTimeout(() => {
      state.pending.delete(id);
      reject(new Error("Prediction worker timed out"));
    }, REQUEST_TIMEOUT_MS);
    state.pending.set(id, { resolve, reject, timeout });
    state.child.stdin.write(
      `${JSON.stringify({ id, ax: values[0], ay: values[1], az: values[2] })}\n`,
      (error) => {
        if (error) {
          clearTimeout(timeout);
          state.pending.delete(id);
          reject(error);
        }
      }
    );
  });
}
