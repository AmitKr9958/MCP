import fs from "fs";
import path from "path";
import { Job, JobState, JobStatus, CheckpointStage } from "./types.js";

export class StatusTracker {
  private statusFile: string;
  private states: Map<string, JobState> = new Map();

  constructor(statusFile: string, jobs: Job[]) {
    this.statusFile = statusFile;
    this.load(jobs);
  }

  private load(jobs: Job[]) {
    let existing: JobState[] = [];
    if (fs.existsSync(this.statusFile)) {
      try {
        existing = JSON.parse(fs.readFileSync(this.statusFile, "utf-8"));
      } catch {
        existing = [];
      }
    }

    const existingMap = new Map(existing.map((s) => [s.id, s]));

    for (const job of jobs) {
      if (existingMap.has(job.id)) {
        this.states.set(job.id, existingMap.get(job.id)!);
      } else {
        this.states.set(job.id, {
          id: job.id,
          status: "pending",
          checkpoint: "none",
          lastUpdated: new Date().toISOString(),
        });
      }
    }

    for (const [id, state] of existingMap) {
      if (!this.states.has(id)) {
        this.states.set(id, state);
      }
    }

    this.save();
  }

  private save() {
    const arr = Array.from(this.states.values()).sort((a, b) =>
      a.id.localeCompare(b.id)
    );
    fs.mkdirSync(path.dirname(this.statusFile), { recursive: true });
    fs.writeFileSync(this.statusFile, JSON.stringify(arr, null, 2), "utf-8");
  }

  get(id: string): JobState | undefined {
    return this.states.get(id);
  }

  setStatus(
    id: string,
    status: JobStatus,
    extra?: Partial<
      Pick<
        JobState,
        | "error"
        | "tailoredResumePath"
        | "analysisPath"
        | "pdfPath"
        | "checkpoint"
      >
    >
  ) {
    const current = this.states.get(id) || {
      id,
      status: "pending" as JobStatus,
      checkpoint: "none" as CheckpointStage,
      lastUpdated: new Date().toISOString(),
    };
    this.states.set(id, {
      ...current,
      status,
      lastUpdated: new Date().toISOString(),
      ...extra,
      ...(status !== "failed" ? { error: undefined } : {}),
    });
    this.save();
  }

  setCheckpoint(
    id: string,
    stage: CheckpointStage,
    extra?: Partial<
      Pick<JobState, "tailoredResumePath" | "analysisPath" | "pdfPath">
    >
  ) {
    const current = this.states.get(id);
    if (!current) return;
    this.states.set(id, {
      ...current,
      checkpoint: stage,
      lastUpdated: new Date().toISOString(),
      ...extra,
    });
    this.save();
  }

  getPendingJobs(jobs: Job[], fromId?: string): Job[] {
    let start = true;
    if (fromId) start = false;
    return jobs.filter((job) => {
      if (fromId && job.id === fromId) start = true;
      if (!start) return false;
      const state = this.states.get(job.id);
      return !state || state.status === "pending" || state.status === "failed";
    });
  }

  getResumable(jobId: string): JobState | null {
    const state = this.states.get(jobId);
    if (!state) return null;
    if (
      (state.status === "failed" || state.status === "in-progress") &&
      state.checkpoint &&
      state.checkpoint !== "none"
    ) {
      return state;
    }
    return null;
  }

  printSummary(jobs: Job[]) {
    console.log("\n📊 Job Status Summary");
    console.log("─".repeat(70));
    for (const job of jobs) {
      const state = this.states.get(job.id);
      const status = state?.status || "pending";
      const cp = state?.checkpoint || "none";
      const icon =
        status === "completed"
          ? "✅"
          : status === "skipped"
          ? "⏭️"
          : status === "failed"
          ? "❌"
          : status === "in-progress"
          ? "🔄"
          : "⏳";
      const cpInfo =
        cp !== "none" && status !== "completed" ? ` [cp:${cp}]` : "";
      console.log(
        `${icon} [${job.id}] ${job.title || "Untitled"} → ${status}${cpInfo}` +
          (state?.error ? ` (${state.error.slice(0, 40)})` : "")
      );
    }
    console.log("─".repeat(70));

    const counts: Record<string, number> = {
      pending: 0,
      completed: 0,
      skipped: 0,
      failed: 0,
      "in-progress": 0,
    };
    for (const s of this.states.values()) {
      counts[s.status] = (counts[s.status] || 0) + 1;
    }
    console.log(
      `Pending: ${counts.pending} | Completed: ${counts.completed} | Skipped: ${counts.skipped} | Failed: ${counts.failed}`
    );
  }
}
