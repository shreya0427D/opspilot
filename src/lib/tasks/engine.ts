import "server-only";
import { createHash } from "node:crypto";
import { FieldValue, Timestamp, type DocumentReference } from "firebase-admin/firestore";
import { ZodError } from "zod";
import { ModelUnavailableError } from "@/lib/ai/gemini";
import {
  TERMINAL_TASK_STATUSES,
  type Step,
  type StepStatus,
  type Task,
  type TaskIntent,
  type TaskTrigger,
  type TimestampLike,
} from "@/lib/domain/types";
import { adminDb } from "@/lib/firebase/admin";
import { AppError, limitReached } from "@/lib/server/errors";
import { log } from "@/lib/server/log";
import { assertWithinLimits, audit, recordUsage, ws } from "@/lib/server/workspace-data";
import { dispatchStep, type StepRef } from "./dispatch";
import { getTool, type NewStep, type ToolResult } from "./registry";
import "./tools"; // registers all tools

const LEASE_MS = 5 * 60_000;
const STEP_TIMEOUT_MS = 5 * 60_000;
const TASK_RUN_WINDOW_MS = 30 * 60_000;
const MODEL_WAIT_MS = 10 * 60_000;
const MAX_ACTIVE_TASKS = 2;
const ACTIVE_STATUSES = ["queued", "planning", "running", "waiting_on_model"];
const OPEN_STEP_STATUSES: StepStatus[] = ["pending", "queued", "running", "waiting"];

const millis = (t: TimestampLike | null | undefined) =>
  !t ? 0 : "toMillis" in t ? t.toMillis() : t.seconds * 1000 + Math.floor(t.nanoseconds / 1e6);

export const taskRef = (workspaceId: string, taskId: string) => ws(workspaceId).tasks.doc(taskId);
export const stepsCol = (workspaceId: string, taskId: string) => taskRef(workspaceId, taskId).collection("steps");
export const stepRef = (workspaceId: string, taskId: string, index: number) =>
  stepsCol(workspaceId, taskId).doc(String(index).padStart(3, "0"));

function newStepDoc(
  ref: StepRef,
  s: NewStep,
  origin: Step["origin"],
  status: StepStatus,
): Step {
  const tool = getTool(s.tool);
  if (!tool) throw new Error(`Unknown tool ${s.tool}`);
  return {
    workspaceId: ref.workspaceId,
    taskId: ref.taskId,
    index: ref.index,
    origin,
    tool: s.tool,
    lane: tool.lane,
    label: s.label,
    args: s.args,
    dependsOn: s.dependsOn,
    dependMode: s.dependMode ?? "succeeded",
    status,
    attempt: 0,
    maxAttempts: tool.maxAttempts,
    leaseUntil: status === "queued" ? Timestamp.fromMillis(Date.now() + LEASE_MS) : null,
    queuedAt: status === "queued" ? Timestamp.now() : null,
    output: null,
    error: null,
    verification: null,
    startedAt: null,
    endedAt: null,
  };
}

// ---------------------------------------------------------------------------------------------
// Task creation (idempotent on submissionKey)
// ---------------------------------------------------------------------------------------------

export interface CreateTaskInput {
  workspaceId: string;
  actorUid: string;
  command: string;
  submissionKey: string;
  trigger: TaskTrigger;
  intent?: TaskIntent;
  params?: Record<string, unknown>;
}

export async function createTask(input: CreateTaskInput): Promise<{ taskId: string; created: boolean }> {
  const taskId = "t_" + createHash("sha256").update(`${input.workspaceId}:${input.submissionKey}`).digest("hex").slice(0, 28);
  const db = adminDb();
  const tRef = taskRef(input.workspaceId, taskId);

  const existing = await tRef.get();
  if (existing.exists) return { taskId, created: false };
  await assertWithinLimits(input.workspaceId, "task");

  const created = await db.runTransaction(async (tx) => {
    if ((await tx.get(tRef)).exists) return false;
    const active = await tx.get(ws(input.workspaceId).tasks.where("status", "in", ACTIVE_STATUSES).limit(MAX_ACTIVE_TASKS));
    if (active.size >= MAX_ACTIVE_TASKS) {
      throw limitReached("Two tasks are already running. Try again when one finishes.");
    }
    const task: Task = {
      command: input.command,
      intent: input.intent ?? null,
      trigger: input.trigger,
      status: "queued",
      createdBy: input.actorUid,
      submissionKey: input.submissionKey,
      params: input.params ?? {},
      stepCount: 1,
      cancelRequested: false,
      costMicros: 0,
      summary: null,
      report: null,
      approvalId: null,
      error: null,
      deadlineAt: Timestamp.fromMillis(Date.now() + TASK_RUN_WINDOW_MS),
      finalStatusHint: null,
      createdAt: FieldValue.serverTimestamp() as unknown as TimestampLike,
      updatedAt: FieldValue.serverTimestamp() as unknown as TimestampLike,
      finishedAt: null,
    };
    tx.set(tRef, task);
    tx.set(
      stepRef(input.workspaceId, taskId, 0),
      newStepDoc({ ...input, taskId, index: 0 }, { tool: "plan", label: "Plan the work", args: {}, dependsOn: [] }, "planner", "queued"),
    );
    await audit(input.workspaceId, input.actorUid, "task.created", `tasks/${taskId}`, { trigger: input.trigger }, tx);
    return true;
  });

  if (created) {
    await recordUsage(input.workspaceId, { tasks: 1 });
    await dispatchStep({ workspaceId: input.workspaceId, taskId, index: 0 });
  }
  return { taskId, created };
}

/** Appends steps after a human decision (e.g. approval) and resumes the task. */
export async function appendStepsAndResume(
  workspaceId: string,
  taskId: string,
  steps: NewStep[],
  origin: Step["origin"],
) {
  const db = adminDb();
  const tRef = taskRef(workspaceId, taskId);
  const firstIndex = await db.runTransaction(async (tx) => {
    const task = (await tx.get(tRef)).data() as Task;
    const base = task.stepCount;
    steps.forEach((s, i) => {
      const ref = { workspaceId, taskId, index: base + i };
      const deps = s.dependsOn.map((d) => base + d);
      tx.set(stepRef(workspaceId, taskId, base + i), newStepDoc(ref, { ...s, dependsOn: deps }, origin, "pending"));
    });
    tx.update(tRef, {
      stepCount: base + steps.length,
      status: "running",
      deadlineAt: Timestamp.fromMillis(Date.now() + TASK_RUN_WINDOW_MS),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return base;
  });
  await advance({ workspaceId, taskId, index: firstIndex });
}

// ---------------------------------------------------------------------------------------------
// Step execution
// ---------------------------------------------------------------------------------------------

type Claim =
  | { kind: "run"; task: Task; step: Step }
  | { kind: "settle" }
  | null;

async function claimStep(ref: StepRef): Promise<Claim> {
  const db = adminDb();
  const tRef = taskRef(ref.workspaceId, ref.taskId);
  const sRef = stepRef(ref.workspaceId, ref.taskId, ref.index);

  return db.runTransaction(async (tx): Promise<Claim> => {
    const [taskSnap, stepSnap] = await Promise.all([tx.get(tRef), tx.get(sRef)]);
    if (!taskSnap.exists || !stepSnap.exists) return null;
    const task = taskSnap.data() as Task;
    const step = stepSnap.data() as Step;
    const now = Date.now();

    if (!["queued", "running", "waiting"].includes(step.status)) return null; // already finished
    if (step.status === "running" && millis(step.leaseUntil) > now) return null; // someone holds it

    const end = (status: StepStatus, error: string | null) => {
      tx.update(sRef, { status, error, leaseUntil: null, endedAt: FieldValue.serverTimestamp() });
      return { kind: "settle" } as const;
    };
    if (task.cancelRequested || TERMINAL_TASK_STATUSES.includes(task.status)) return end("canceled", null);
    if (step.attempt >= step.maxAttempts) return end("failed", step.error ?? "Gave up after repeated attempts");
    if (millis(task.deadlineAt) < now) return end("failed", "The task ran past its time limit");

    tx.update(sRef, {
      status: "running",
      attempt: step.attempt + 1,
      leaseUntil: Timestamp.fromMillis(now + LEASE_MS),
      startedAt: step.startedAt ?? FieldValue.serverTimestamp(),
    });
    tx.update(tRef, {
      status: step.tool === "plan" ? "planning" : "running",
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { kind: "run", task, step: { ...step, attempt: step.attempt + 1 } };
  });
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Step timed out")), ms);
    promise.then(
      (v) => (clearTimeout(timer), resolve(v)),
      (e) => (clearTimeout(timer), reject(e)),
    );
  });
}

export async function runStep(ref: StepRef): Promise<void> {
  const claim = await claimStep(ref);
  if (!claim) return;
  if (claim.kind === "settle") return advance(ref);

  const { task, step } = claim;
  const sRef = stepRef(ref.workspaceId, ref.taskId, ref.index);
  const fail = async (error: string) => {
    await sRef.update({ status: "failed", error, leaseUntil: null, endedAt: FieldValue.serverTimestamp() });
    await advance(ref);
  };

  const tool = getTool(step.tool);
  if (!tool) return fail(`Tool "${step.tool}" is not registered`);
  // Security boundary: no planner-created step may perform an external action.
  if (tool.permission === "external" && step.origin !== "approval") {
    return fail("External actions can only run after an explicit approval");
  }

  // Gather dependency outputs. In "succeeded" mode, skip if any dependency did not succeed;
  // in "settled" mode, pass along whatever succeeded.
  const deps: Record<number, Record<string, unknown>> = {};
  for (const d of step.dependsOn) {
    const dep = (await stepRef(ref.workspaceId, ref.taskId, d).get()).data() as Step | undefined;
    if (step.dependMode === "settled" && dep && dep.status !== "succeeded") continue;
    if (!dep || dep.status !== "succeeded") {
      await sRef.update({ status: "skipped", error: "A step it depends on did not succeed", leaseUntil: null, endedAt: FieldValue.serverTimestamp() });
      return advance(ref);
    }
    deps[d] = dep.output ?? {};
  }

  let result: ToolResult;
  try {
    const args = tool.argsSchema.parse(step.args);
    result = await withTimeout(tool.run({ workspaceId: ref.workspaceId, taskId: ref.taskId, task, step, deps }, args), STEP_TIMEOUT_MS);
  } catch (err) {
    if (err instanceof ModelUnavailableError) {
      await sRef.update({ status: "waiting", error: err.message, leaseUntil: Timestamp.fromMillis(Date.now() + MODEL_WAIT_MS) });
      await taskRef(ref.workspaceId, ref.taskId).update({ status: "waiting_on_model", updatedAt: FieldValue.serverTimestamp() });
      return;
    }
    const permanent = err instanceof AppError || err instanceof ZodError;
    const message = err instanceof AppError ? err.message : err instanceof ZodError ? "Invalid step arguments" : "Unexpected error while running this step";
    log.warn("Step failed", { ...ref, tool: step.tool, attempt: step.attempt, permanent, err });
    if (permanent || step.attempt >= step.maxAttempts) return fail(message);
    const backoff = Math.min(60_000, 2_000 * 2 ** (step.attempt - 1));
    await sRef.update({
      status: "queued",
      error: message,
      leaseUntil: Timestamp.fromMillis(Date.now() + backoff + LEASE_MS),
      queuedAt: Timestamp.fromMillis(Date.now() + backoff),
    });
    await dispatchStep(ref, backoff);
    return;
  }

  await adminDb().runTransaction(async (tx) => {
    const tRef = taskRef(ref.workspaceId, ref.taskId);
    const current = (await tx.get(tRef)).data() as Task;
    tx.update(sRef, {
      status: "succeeded",
      output: result.output,
      verification: result.verification ?? null,
      error: null,
      leaseUntil: null,
      endedAt: FieldValue.serverTimestamp(),
    });
    const taskUpdate: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (result.costMicros) taskUpdate.costMicros = FieldValue.increment(result.costMicros);
    if (result.summary) taskUpdate.summary = result.summary;
    if (result.finalStatus) taskUpdate.finalStatusHint = result.finalStatus;
    if (result.report) taskUpdate.report = result.report;
    if (result.pause) taskUpdate.status = result.pause;
    if (result.output.intent) taskUpdate.intent = result.output.intent;
    if (result.appendSteps?.length) {
      const base = current.stepCount;
      result.appendSteps.forEach((s, i) => {
        const index = base + i;
        tx.set(
          stepRef(ref.workspaceId, ref.taskId, index),
          newStepDoc({ ...ref, index }, { ...s, dependsOn: s.dependsOn.map((d) => base + d) }, "planner", "pending"),
        );
      });
      taskUpdate.stepCount = base + result.appendSteps.length;
    }
    tx.update(tRef, taskUpdate);
  });

  await advance(ref);
}

// ---------------------------------------------------------------------------------------------
// Advancing and finalizing
// ---------------------------------------------------------------------------------------------

/** Queues steps whose dependencies are met, skips blocked ones, and finalizes finished tasks. */
export async function advance(ref: StepRef): Promise<void> {
  const db = adminDb();
  const tRef = taskRef(ref.workspaceId, ref.taskId);
  const [taskSnap, stepsSnap] = await Promise.all([tRef.get(), stepsCol(ref.workspaceId, ref.taskId).get()]);
  const task = taskSnap.data() as Task | undefined;
  if (!task || TERMINAL_TASK_STATUSES.includes(task.status)) return;

  const steps = new Map(stepsSnap.docs.map((d) => [(d.data() as Step).index, d]));
  const statusOf = (i: number) => (steps.get(i)?.data() as Step | undefined)?.status;

  for (const doc of stepsSnap.docs) {
    const step = doc.data() as Step;
    if (step.status !== "pending") continue;
    const depStatuses = step.dependsOn.map(statusOf);
    let next: StepStatus | null = null;
    const finished = (s: StepStatus | undefined) => s === "succeeded" || s === "failed" || s === "skipped" || s === "canceled";
    if (task.cancelRequested) next = "canceled";
    else if (step.dependMode === "settled") next = depStatuses.every(finished) ? "queued" : null;
    else if (depStatuses.some((s) => s === "failed" || s === "skipped" || s === "canceled")) next = "skipped";
    else if (depStatuses.every((s) => s === "succeeded")) next = "queued";
    if (!next) continue;

    const won = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(doc.ref)).data() as Step;
      if (fresh.status !== "pending") return false;
      tx.update(doc.ref, {
        status: next,
        leaseUntil: next === "queued" ? Timestamp.fromMillis(Date.now() + LEASE_MS) : null,
        ...(next === "queued" ? { queuedAt: Timestamp.now() } : {}),
        ...(next !== "queued" ? { endedAt: FieldValue.serverTimestamp() } : {}),
        ...(next === "skipped" ? { error: "A step it depends on did not succeed" } : {}),
      });
      return true;
    });
    if (won && next === "queued") await dispatchStep({ ...ref, index: step.index });
    if (won && next !== "queued") return advance(ref); // cascade skips/cancels
  }

  await maybeFinalize(tRef);
}

async function maybeFinalize(tRef: DocumentReference) {
  const db = adminDb();
  await db.runTransaction(async (tx) => {
    const task = (await tx.get(tRef)).data() as Task | undefined;
    if (!task) return; // deleted (e.g. account deletion) while a step was running
    if (TERMINAL_TASK_STATUSES.includes(task.status) || task.status === "awaiting_approval") return;
    const steps = (await tx.get(tRef.collection("steps"))).docs.map((d) => d.data() as Step);
    if (steps.some((s) => OPEN_STEP_STATUSES.includes(s.status))) return;

    const failed = steps.filter((s) => s.status === "failed").length;
    const succeeded = steps.filter((s) => s.status === "succeeded").length;
    let status: Task["status"];
    if (task.cancelRequested) status = "canceled";
    else if (failed === 0 && task.finalStatusHint) status = task.finalStatusHint;
    else if (failed === 0) status = "succeeded";
    else if (succeeded > 1) status = "partially_succeeded"; // more than just the plan step
    else status = "failed";

    const firstError = steps.find((s) => s.status === "failed")?.error ?? null;
    tx.update(tRef, {
      status,
      error: status === "failed" || status === "partially_succeeded" ? firstError : null,
      finishedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  });
}

// ---------------------------------------------------------------------------------------------
// Cancellation and recovery
// ---------------------------------------------------------------------------------------------

export async function requestCancel(workspaceId: string, taskId: string, actorUid: string) {
  const db = adminDb();
  const tRef = taskRef(workspaceId, taskId);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(tRef);
    if (!snap.exists) throw new AppError(404, "not_found", "Task not found");
    const task = snap.data() as Task;
    if (TERMINAL_TASK_STATUSES.includes(task.status)) throw new AppError(409, "conflict", "This task has already finished");
    if (task.approvalId) {
      const aRef = ws(workspaceId).approvals.doc(task.approvalId);
      const items = await tx.get(aRef.collection("items").where("status", "==", "pending"));
      items.docs.forEach((d) => tx.update(d.ref, { status: "rejected", decidedAt: FieldValue.serverTimestamp() }));
      tx.update(aRef, { status: "completed" });
    }
    // An approval-parked task has nothing running, so it can be marked canceled right away.
    tx.update(tRef, {
      cancelRequested: true,
      ...(task.status === "awaiting_approval" ? { status: "running" } : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await audit(workspaceId, actorUid, "task.cancel_requested", `tasks/${taskId}`, {}, tx);
  });
  await advance({ workspaceId, taskId, index: 0 });
}

/** Re-dispatches steps whose lease expired (crash, deploy, lost delivery) or whose model wait ended. */
export async function recoverStaleSteps(limit = 100): Promise<number> {
  const db = adminDb();
  const snap = await db
    .collectionGroup("steps")
    .where("status", "in", ["running", "queued", "waiting"])
    .where("leaseUntil", "<", Timestamp.now())
    .limit(limit)
    .get();

  let recovered = 0;
  for (const doc of snap.docs) {
    const step = doc.data() as Step;
    const requeued = await db.runTransaction(async (tx) => {
      const fresh = (await tx.get(doc.ref)).data() as Step;
      if (!["running", "queued", "waiting"].includes(fresh.status) || millis(fresh.leaseUntil) > Date.now()) return false;
      tx.update(doc.ref, { status: "queued", leaseUntil: Timestamp.fromMillis(Date.now() + LEASE_MS), queuedAt: Timestamp.now() });
      return true;
    });
    if (requeued) {
      recovered++;
      await dispatchStep({ workspaceId: step.workspaceId, taskId: step.taskId, index: step.index });
    }
  }
  if (recovered) log.info("Recovered stale steps", { recovered });
  return recovered;
}

/** A queued step nobody has claimed for this long is treated as a lost hand-off. */
export const STALLED_QUEUE_MS = 20_000;

/**
 * Re-dispatches this task's steps that are stuck: queued but unclaimed for STALLED_QUEUE_MS,
 * running past their lease, or done waiting on the model. Safe to call repeatedly — the claim
 * transaction in runStep lets only one runner execute a step, so duplicates are no-ops.
 */
export async function resumeStalledSteps(workspaceId: string, taskId: string): Promise<number> {
  const task = (await taskRef(workspaceId, taskId).get()).data() as Task | undefined;
  if (!task || TERMINAL_TASK_STATUSES.includes(task.status) || task.status === "awaiting_approval") return 0;
  const now = Date.now();
  const steps = (await stepsCol(workspaceId, taskId).get()).docs.map((d) => d.data() as Step);
  let resumed = 0;
  for (const step of steps) {
    const stalledQueue = step.status === "queued" && millis(step.queuedAt ?? null) > 0 && now - millis(step.queuedAt ?? null) > STALLED_QUEUE_MS;
    const legacyQueue = step.status === "queued" && !step.queuedAt && step.attempt === 0 && millis(step.leaseUntil) - LEASE_MS + STALLED_QUEUE_MS < now;
    const expired = (step.status === "running" || step.status === "waiting") && millis(step.leaseUntil) < now;
    if (!stalledQueue && !legacyQueue && !expired) continue;
    const ok = await adminDb().runTransaction(async (tx) => {
      const ref = stepRef(workspaceId, taskId, step.index);
      const fresh = (await tx.get(ref)).data() as Step;
      if (fresh.status !== step.status || millis(fresh.queuedAt ?? null) !== millis(step.queuedAt ?? null)) return false;
      if (fresh.status === "running" && millis(fresh.leaseUntil) > now) return false;
      tx.update(ref, { status: "queued", leaseUntil: Timestamp.fromMillis(now + LEASE_MS), queuedAt: Timestamp.now() });
      return true;
    });
    if (ok) {
      resumed++;
      log.warn("Resuming stalled step", { workspaceId, taskId, index: step.index, tool: step.tool, was: step.status });
      await dispatchStep({ workspaceId, taskId, index: step.index }, 0, { preferInline: true });
    }
  }
  return resumed;
}
