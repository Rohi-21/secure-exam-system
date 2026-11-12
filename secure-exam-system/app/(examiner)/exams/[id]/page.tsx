"use client";
/**
 * Examiner Post-Exam Dashboard — /examiner/exams/[id]
 * Handles: answer reveal → Merkle finalize → evaluate → release results
 *
 * The examiner RSA-unwraps their ExamKEK in browser then sends it to the
 * server cache. All sensitive key material stays within the examiner's
 * browser private key trust boundary (non-exportable CryptoKey).
 */

import { useState } from "react";
import { useParams } from "next/navigation";

type Step = "reconstruct" | "reveal" | "finalize" | "evaluate" | "release" | "done";
type StepStatus = "pending" | "running" | "done" | "error";

interface StepState {
  status: StepStatus;
  message: string;
}

function getToken(): string {
  return (window as typeof window & { __accessToken?: string }).__accessToken ?? "";
}

export default function ExaminerExamPage() {
  const { id: examId } = useParams() as { id: string };
  const [currentStep, setCurrentStep] = useState<Step>("reconstruct");
  const [stepStates, setStepStates] = useState<Record<Step, StepState>>({
    reconstruct: { status: "pending", message: "" },
    reveal:      { status: "pending", message: "" },
    finalize:    { status: "pending", message: "" },
    evaluate:    { status: "pending", message: "" },
    release:     { status: "pending", message: "" },
    done:        { status: "pending", message: "" },
  });

  // Form state
  const [trustee1, setTrustee1] = useState({ id: "", password: "" });
  const [trustee2, setTrustee2] = useState({ id: "", password: "" });
  const [revealAnswers, setRevealAnswers] = useState("");
  const [revealSalt, setRevealSalt] = useState("");
  const [commitment, setCommitment] = useState("");
  const [evaluationSummary, setEvaluationSummary] = useState<{ studentId: string; score: number }[]>([]);

  function setStep(step: Step, status: StepStatus, message: string) {
    setStepStates((prev) => ({ ...prev, [step]: { status, message } }));
  }

  // ── Step 1: Shamir Reconstruction (2-of-3) ───────────────────────────
  async function handleReconstruct() {
    setStep("reconstruct", "running", "Reconstructing ExamKEK from trustee shares…");
    try {
      const res = await fetch("/api/keys/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({
          examId,
          trustees: [
            { trusteeId: trustee1.id, password: trustee1.password },
            { trusteeId: trustee2.id, password: trustee2.password },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("reconstruct", "done", `✓ ExamKEK reconstructed. Cached until ${new Date(data.cacheExpiresAt).toLocaleTimeString()}`);
      setCurrentStep("reveal");
    } catch (e: unknown) {
      setStep("reconstruct", "error", `✗ ${(e as Error).message}`);
    }
  }

  // ── Step 2: Reveal Commitment ─────────────────────────────────────────
  async function handleReveal() {
    setStep("reveal", "running", "Verifying commitment…");
    try {
      let parsed: Record<string, string>;
      try { parsed = JSON.parse(revealAnswers); }
      catch { throw new Error("Answers must be valid JSON, e.g. {\"1\":\"A\",\"2\":\"B\"}"); }

      const res = await fetch(`/api/exam/${examId}/reveal-commitment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ answers: parsed, salt: revealSalt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCommitment(data.commitment ?? "");
      setStep("reveal", "done", `✓ Commitment verified. Salt stored. Commitment: ${data.commitment?.slice(0, 16)}…`);
      setCurrentStep("finalize");
    } catch (e: unknown) {
      setStep("reveal", "error", `✗ ${(e as Error).message}`);
    }
  }

  // ── Step 3: Merkle Finalization ───────────────────────────────────────
  async function handleFinalize() {
    setStep("finalize", "running", "Building Merkle tree…");
    try {
      const res = await fetch(`/api/exam/${examId}/finalize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("finalize", "done", `✓ Merkle root: ${data.merkleRoot?.slice(0, 16)}… | ${data.submissionCount} submissions`);
      setCurrentStep("evaluate");
    } catch (e: unknown) {
      setStep("finalize", "error", `✗ ${(e as Error).message}`);
    }
  }

  // ── Step 4: Evaluate ─────────────────────────────────────────────────
  async function handleEvaluate() {
    setStep("evaluate", "running", "Grading and encrypting results…");
    try {
      const res = await fetch(`/api/exam/${examId}/evaluate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEvaluationSummary(data.summary ?? []);
      setStep("evaluate", "done", `✓ Evaluated ${data.count} submission(s). Results encrypted and signed.`);
      setCurrentStep("release");
    } catch (e: unknown) {
      setStep("evaluate", "error", `✗ ${(e as Error).message}`);
    }
  }

  // ── Step 5: Release Results ───────────────────────────────────────────
  async function handleRelease() {
    setStep("release", "running", "Releasing results to students…");
    try {
      const res = await fetch(`/api/exam/${examId}/results`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("release", "done", `✓ Results released to ${data.count} student(s).`);
      setCurrentStep("done");
    } catch (e: unknown) {
      setStep("release", "error", `✗ ${(e as Error).message}`);
    }
  }

  const stepOrder: Step[] = ["reconstruct", "reveal", "finalize", "evaluate", "release"];
  const stepLabels: Record<Step, string> = {
    reconstruct: "1. Shamir Key Reconstruction",
    reveal:      "2. Reveal Answer Commitment",
    finalize:    "3. Merkle Tree Finalization",
    evaluate:    "4. Auto-Grade Submissions",
    release:     "5. Release Results",
    done:        "Complete",
  };

  return (
    <div className="min-h-screen bg-gray-950 p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-white mb-1">Post-Exam Operations</h1>
        <p className="text-gray-400 text-sm mb-6">Exam ID: <code className="text-blue-400">{examId}</code></p>

        {/* Progress bar */}
        <div className="flex gap-2 mb-8">
          {stepOrder.map((s) => (
            <div key={s} className={`flex-1 h-1.5 rounded-full transition-colors ${
              stepStates[s].status === "done" ? "bg-green-500" :
              stepStates[s].status === "running" ? "bg-blue-500 animate-pulse" :
              stepStates[s].status === "error" ? "bg-red-500" : "bg-gray-700"
            }`} />
          ))}
        </div>

        <div className="space-y-4">
          {/* Step 1 — Reconstruct */}
          <StepCard title={stepLabels.reconstruct} state={stepStates.reconstruct} active={currentStep === "reconstruct"}>
            <div className="grid grid-cols-2 gap-3">
              {[{ label: "Trustee 1 ID", state: trustee1, set: setTrustee1 },
                { label: "Trustee 2 ID", state: trustee2, set: setTrustee2 }].map(({ label, state, set }) => (
                <div key={label} className="space-y-2">
                  <label className="text-xs text-gray-400">{label}</label>
                  <input className="input-dark w-full" placeholder="User UUID"
                    value={state.id} onChange={(e) => set((p) => ({ ...p, id: e.target.value }))} />
                  <input className="input-dark w-full" type="password" placeholder="Trustee password"
                    value={state.password} onChange={(e) => set((p) => ({ ...p, password: e.target.value }))} />
                </div>
              ))}
            </div>
            <button onClick={handleReconstruct} className="btn-primary mt-3 w-full">
              Reconstruct ExamKEK (2-of-3 Shamir)
            </button>
          </StepCard>

          {/* Step 2 — Reveal */}
          <StepCard title={stepLabels.reveal} state={stepStates.reveal} active={currentStep === "reveal"}>
            <label className="text-xs text-gray-400">Answer Key JSON (e.g. {`{"1":"A","2":"B"}`})</label>
            <textarea className="input-dark w-full h-24 mt-1 font-mono text-xs"
              value={revealAnswers} onChange={(e) => setRevealAnswers(e.target.value)} />
            <label className="text-xs text-gray-400 mt-2 block">Commitment Salt (hex — from your records)</label>
            <input className="input-dark w-full mt-1 font-mono text-xs"
              value={revealSalt} onChange={(e) => setRevealSalt(e.target.value)} />
            <button onClick={handleReveal} className="btn-primary mt-3 w-full">Verify & Reveal Commitment</button>
          </StepCard>

          {/* Step 3 — Finalize */}
          <StepCard title={stepLabels.finalize} state={stepStates.finalize} active={currentStep === "finalize"}>
            <p className="text-xs text-gray-400">Builds SHA-256 Merkle tree over all submissions. Each student gets an inclusion proof.</p>
            <button onClick={handleFinalize} className="btn-primary mt-3 w-full">Build Merkle Tree</button>
          </StepCard>

          {/* Step 4 — Evaluate */}
          <StepCard title={stepLabels.evaluate} state={stepStates.evaluate} active={currentStep === "evaluate"}>
            <p className="text-xs text-gray-400">Decrypts submissions, grades MCQs, encrypts results with Ed25519 signature.</p>
            <button onClick={handleEvaluate} className="btn-primary mt-3 w-full">Grade All Submissions</button>
            {evaluationSummary.length > 0 && (
              <div className="mt-3 max-h-48 overflow-y-auto space-y-1">
                {evaluationSummary.map((r) => (
                  <div key={r.studentId} className="flex justify-between text-xs text-gray-300 bg-gray-800 px-3 py-1.5 rounded">
                    <span className="font-mono">{r.studentId.slice(0, 8)}…</span>
                    <span className={r.score >= 50 ? "text-green-400" : "text-red-400"}>{r.score}%</span>
                  </div>
                ))}
              </div>
            )}
          </StepCard>

          {/* Step 5 — Release */}
          <StepCard title={stepLabels.release} state={stepStates.release} active={currentStep === "release"}>
            <p className="text-xs text-gray-400">Makes results visible to students. This action cannot be undone.</p>
            <button onClick={handleRelease} className="btn-danger mt-3 w-full">Release Results to Students</button>
          </StepCard>

          {/* Done */}
          {currentStep === "done" && (
            <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4 text-green-400 text-sm text-center">
              ✓ All post-exam operations complete. Students can now view their results.
            </div>
          )}
        </div>
      </div>

      <style>{`
        .input-dark { background:#1f2937; border:1px solid #374151; border-radius:0.5rem; padding:0.4rem 0.75rem; color:white; font-size:0.8125rem; outline:none; }
        .input-dark:focus { border-color:#3b82f6; }
        .btn-primary { background:#2563eb; color:white; border-radius:0.5rem; padding:0.5rem 1rem; font-size:0.875rem; font-weight:500; cursor:pointer; transition:background 0.15s; }
        .btn-primary:hover { background:#1d4ed8; }
        .btn-danger { background:#dc2626; color:white; border-radius:0.5rem; padding:0.5rem 1rem; font-size:0.875rem; font-weight:500; cursor:pointer; }
        .btn-danger:hover { background:#b91c1c; }
      `}</style>
    </div>
  );
}

function StepCard({ title, state, active, children }: {
  title: string; state: StepState; active: boolean; children: React.ReactNode
}) {
  const borderColor = state.status === "done" ? "border-green-500/40" :
                      state.status === "error" ? "border-red-500/40" :
                      active ? "border-blue-500/40" : "border-gray-700/40";
  return (
    <div className={`border rounded-xl p-4 transition-all ${borderColor} ${!active && state.status === "pending" ? "opacity-50" : ""}`}
      style={{ background: "#111827" }}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-semibold text-white text-sm">{title}</h2>
        {state.status === "done" && <span className="text-green-400 text-xs">✓ Done</span>}
        {state.status === "error" && <span className="text-red-400 text-xs">✗ Error</span>}
        {state.status === "running" && <span className="text-blue-400 text-xs animate-pulse">⟳ Running</span>}
      </div>
      {state.message && (
        <p className={`text-xs mb-3 ${state.status === "error" ? "text-red-400" : "text-gray-400"}`}>
          {state.message}
        </p>
      )}
      {(active || state.status === "error") && children}
    </div>
  );
}
