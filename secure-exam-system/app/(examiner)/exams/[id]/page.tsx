"use client";

/**
 * Examiner Post-Exam Dashboard — /exams/[id]
 * Handles: Shamir reconstruction → answer reveal → Merkle finalize → evaluate → release results
 */

import React, { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/layout/Navbar";
import { Footer } from "@/components/layout/Footer";
import { PageContainer } from "@/components/layout/PageContainer";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";

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
  const router = useRouter();

  const [currentStep, setCurrentStep] = useState<Step>("reconstruct");
  const [stepStates, setStepStates] = useState<Record<Step, StepState>>({
    reconstruct: { status: "pending", message: "" },
    reveal: { status: "pending", message: "" },
    finalize: { status: "pending", message: "" },
    evaluate: { status: "pending", message: "" },
    release: { status: "pending", message: "" },
    done: { status: "pending", message: "" },
  });

  // Form state
  const [trustee1, setTrustee1] = useState({ id: "", password: "" });
  const [trustee2, setTrustee2] = useState({ id: "", password: "" });
  const [revealAnswers, setRevealAnswers] = useState("");
  const [revealSalt, setRevealSalt] = useState("");
  const [commitment, setCommitment] = useState("");
  const [evaluationSummary, setEvaluationSummary] = useState<{ studentId: string; score: number }[]>([]);

  useEffect(() => {
    async function loadExamState() {
      try {
        const res = await fetch(`/api/exam/${examId}`, {
          headers: { Authorization: `Bearer ${getToken()}` },
          credentials: "include",
        });
        if (!res.ok) return;
        const data = await res.json();
        const exam = data.exam;
        if (!exam) return;

        if (exam.trustees && exam.trustees.length >= 2) {
          setTrustee1((prev) => ({ ...prev, id: prev.id || exam.trustees[0].trusteeId }));
          setTrustee2((prev) => ({ ...prev, id: prev.id || exam.trustees[1].trusteeId }));
        }

        if (exam.isReleased) {
          setCurrentStep("done");
          setStepStates({
            reconstruct: { status: "done", message: "ExamKEK previously reconstructed" },
            reveal: { status: "done", message: "Answer commitment verified" },
            finalize: { status: "done", message: `Merkle root: ${exam.merkleRoot?.slice(0, 16) ?? "finalized"}…` },
            evaluate: { status: "done", message: `Graded ${exam.resultCount} candidate(s)` },
            release: { status: "done", message: `Published to ${exam.releasedResultCount} candidates` },
            done: { status: "done", message: "Exam lifecycle complete" },
          });
        } else if (exam.resultCount > 0) {
          setCurrentStep("release");
          setStepStates((prev) => ({
            ...prev,
            reconstruct: { status: "done", message: "ExamKEK reconstructed" },
            reveal: { status: "done", message: "Answer commitment verified" },
            finalize: { status: "done", message: "Merkle root finalized" },
            evaluate: { status: "done", message: `Graded ${exam.resultCount} candidate(s)` },
          }));
        } else if (exam.isFinalized) {
          setCurrentStep("evaluate");
          setStepStates((prev) => ({
            ...prev,
            reconstruct: { status: "done", message: "ExamKEK reconstructed" },
            reveal: { status: "done", message: "Answer commitment verified" },
            finalize: { status: "done", message: `Merkle root: ${exam.merkleRoot?.slice(0, 16) ?? "finalized"}…` },
          }));
        } else if (exam.isAnswerRevealed) {
          setCurrentStep("finalize");
          setStepStates((prev) => ({
            ...prev,
            reconstruct: { status: "done", message: "ExamKEK reconstructed" },
            reveal: { status: "done", message: "Answer commitment verified" },
          }));
        }
      } catch (err) {
        console.warn("[examiner] Could not load initial exam state", err);
      }
    }
    loadExamState();
  }, [examId]);

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
      setStep(
        "reconstruct",
        "done",
        `ExamKEK reconstructed. Cached until ${new Date(data.cacheExpiresAt).toLocaleTimeString()}`
      );
      setCurrentStep("reveal");
    } catch (e: unknown) {
      setStep("reconstruct", "error", (e as Error).message);
    }
  }

  // ── Step 2: Reveal Commitment ─────────────────────────────────────────
  async function handleReveal() {
    setStep("reveal", "running", "Verifying commitment salt and answer hash…");
    try {
      let parsed: Record<string, string>;
      try {
        parsed = JSON.parse(revealAnswers);
      } catch {
        throw new Error('Answers must be valid JSON, e.g. {"1":"A","2":"B"}');
      }

      const res = await fetch(`/api/exam/${examId}/reveal-commitment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ answers: parsed, salt: revealSalt }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setCommitment(data.commitment ?? "");
      setStep(
        "reveal",
        "done",
        `Commitment verified against published pre-exam digest: ${data.commitment?.slice(0, 24)}…`
      );
      setCurrentStep("finalize");
    } catch (e: unknown) {
      setStep("reveal", "error", (e as Error).message);
    }
  }

  // ── Step 3: Merkle Finalization ───────────────────────────────────────
  async function handleFinalize() {
    setStep("finalize", "running", "Assembling cryptographic Merkle tree…");
    try {
      const res = await fetch(`/api/exam/${examId}/finalize`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep(
        "finalize",
        "done",
        `Merkle root published: ${data.merkleRoot?.slice(0, 24)}… across ${data.submissionCount} submission(s)`
      );
      setCurrentStep("evaluate");
    } catch (e: unknown) {
      setStep("finalize", "error", (e as Error).message);
    }
  }

  // ── Step 4: Evaluate ─────────────────────────────────────────────────
  async function handleEvaluate() {
    setStep("evaluate", "running", "Decrypting submissions, grading MCQs, and signing…");
    try {
      const res = await fetch(`/api/exam/${examId}/evaluate`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEvaluationSummary(data.summary ?? []);
      setStep("evaluate", "done", `Evaluated ${data.count} submission(s). Results encrypted with Ed25519 signature.`);
      setCurrentStep("release");
    } catch (e: unknown) {
      setStep("evaluate", "error", (e as Error).message);
    }
  }

  // ── Step 5: Release Results ───────────────────────────────────────────
  async function handleRelease() {
    setStep("release", "running", "Releasing evaluated results to student portals…");
    try {
      const res = await fetch(`/api/exam/${examId}/results`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStep("release", "done", `Results published to ${data.count} candidates.`);
      setCurrentStep("done");
    } catch (e: unknown) {
      setStep("release", "error", (e as Error).message);
    }
  }

  const stepOrder: Step[] = ["reconstruct", "reveal", "finalize", "evaluate", "release"];
  const stepTitles: Record<Step, string> = {
    reconstruct: "1. Shamir Key Reconstruction",
    reveal: "2. Reveal Answer Commitment",
    finalize: "3. Merkle Tree Finalization",
    evaluate: "4. Auto-Grade Submissions",
    release: "5. Release Results",
    done: "Lifecycle Complete",
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <Navbar />

      <main className="flex-1">
        <PageContainer
          title="Post-Examination Governance"
          description={`Execute zero-knowledge key reconstruction, commitment reveals, and tamper-proof Merkle grading for assessment ID: ${examId}`}
          backHref="/exams"
          backLabel="All Examinations"
          maxWidth="narrow"
        >
          {/* Progress Tracker */}
          <div className="grid grid-cols-5 gap-2 mb-8">
            {stepOrder.map((s, idx) => {
              const st = stepStates[s];
              const isCurrent = currentStep === s;
              return (
                <div
                  key={s}
                  className={`p-2.5 rounded-xl border text-center transition-colors ${
                    st.status === "done"
                      ? "bg-emerald-950/40 border-emerald-800/80 text-emerald-400"
                      : st.status === "running"
                      ? "bg-blue-950/60 border-blue-500/80 text-blue-300"
                      : st.status === "error"
                      ? "bg-red-950/40 border-red-800/80 text-red-400"
                      : isCurrent
                      ? "bg-slate-900 border-slate-700 text-slate-200"
                      : "bg-slate-900/30 border-slate-800 text-slate-500"
                  }`}
                >
                  <div className="text-[10px] font-mono uppercase tracking-wider">
                    Phase {idx + 1}
                  </div>
                  <div className="text-xs font-semibold mt-0.5 truncate">
                    {s}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="space-y-6">
            {/* Step 1: Reconstruct */}
            <StepSectionCard
              title={stepTitles.reconstruct}
              state={stepStates.reconstruct}
              active={currentStep === "reconstruct"}
            >
              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Provide credentials for any 2 of the 3 designated trustees to decrypt their Shamir polynomial shares and reconstruct ExamKEK.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="text-xs font-semibold text-slate-300 block">Trustee A</span>
                    <Input
                      label="Trustee ID / Name"
                      placeholder="e.g. trustee-1"
                      value={trustee1.id}
                      onChange={(e) => setTrustee1({ ...trustee1, id: e.target.value })}
                    />
                    <Input
                      label="Trustee Password"
                      type="password"
                      placeholder="••••••••••••"
                      value={trustee1.password}
                      onChange={(e) => setTrustee1({ ...trustee1, password: e.target.value })}
                    />
                  </div>

                  <div className="space-y-3 p-4 rounded-xl bg-slate-950/70 border border-slate-800">
                    <span className="text-xs font-semibold text-slate-300 block">Trustee B</span>
                    <Input
                      label="Trustee ID / Name"
                      placeholder="e.g. trustee-2"
                      value={trustee2.id}
                      onChange={(e) => setTrustee2({ ...trustee2, id: e.target.value })}
                    />
                    <Input
                      label="Trustee Password"
                      type="password"
                      placeholder="••••••••••••"
                      value={trustee2.password}
                      onChange={(e) => setTrustee2({ ...trustee2, password: e.target.value })}
                    />
                  </div>
                </div>

                <Button
                  variant="primary"
                  size="md"
                  loading={stepStates.reconstruct.status === "running"}
                  onClick={handleReconstruct}
                  className="w-full"
                >
                  Reconstruct ExamKEK (2-of-3 Quorum)
                </Button>
              </div>
            </StepSectionCard>

            {/* Step 2: Reveal */}
            <StepSectionCard
              title={stepTitles.reveal}
              state={stepStates.reveal}
              active={currentStep === "reveal"}
            >
              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Provide the official answer key JSON and the commitment salt generated prior to exam launch. The server will mathematically verify that the SHA-256 hash matches the published pre-exam commitment.
                </p>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-slate-300">
                    Answer Key JSON
                  </label>
                  <textarea
                    rows={3}
                    placeholder='{"1":"A","2":"B","3":"C"}'
                    value={revealAnswers}
                    onChange={(e) => setRevealAnswers(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 rounded-lg p-3 text-slate-100 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                <Input
                  label="Commitment Salt (Hex)"
                  placeholder="e.g. a3f9b2c8..."
                  value={revealSalt}
                  onChange={(e) => setRevealSalt(e.target.value)}
                />

                <Button
                  variant="primary"
                  size="md"
                  loading={stepStates.reveal.status === "running"}
                  onClick={handleReveal}
                  className="w-full"
                >
                  Verify Commitment &amp; Reveal Key
                </Button>
              </div>
            </StepSectionCard>

            {/* Step 3: Finalize */}
            <StepSectionCard
              title={stepTitles.finalize}
              state={stepStates.finalize}
              active={currentStep === "finalize"}
            >
              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Assembles all candidate submissions into a cryptographic SHA-256 Merkle tree. Computes the immutable Merkle Root and produces zero-knowledge sibling inclusion paths for each candidate.
                </p>

                <Button
                  variant="primary"
                  size="md"
                  loading={stepStates.finalize.status === "running"}
                  onClick={handleFinalize}
                  className="w-full"
                >
                  Assemble &amp; Finalize Merkle Tree
                </Button>
              </div>
            </StepSectionCard>

            {/* Step 4: Evaluate */}
            <StepSectionCard
              title={stepTitles.evaluate}
              state={stepStates.evaluate}
              active={currentStep === "evaluate"}
            >
              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Decrypts submission envelopes, compares candidate choices against the revealed answer key, and seals each score with an Ed25519 digital examiner attestation signature.
                </p>

                <Button
                  variant="primary"
                  size="md"
                  loading={stepStates.evaluate.status === "running"}
                  onClick={handleEvaluate}
                  className="w-full"
                >
                  Grade Submissions &amp; Sign Attestations
                </Button>

                {evaluationSummary.length > 0 && (
                  <div className="mt-4 p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                    <span className="text-xs font-semibold text-slate-300 block">
                      Evaluation Summary ({evaluationSummary.length} Candidates)
                    </span>
                    <div className="max-h-48 overflow-y-auto space-y-1.5 font-mono text-xs pr-1">
                      {evaluationSummary.map((item) => (
                        <div
                          key={item.studentId}
                          className="flex items-center justify-between p-2 rounded bg-slate-900 border border-slate-800"
                        >
                          <span className="text-slate-400">{item.studentId}</span>
                          <span className={`font-bold ${item.score >= 50 ? "text-emerald-400" : "text-red-400"}`}>
                            {item.score}%
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </StepSectionCard>

            {/* Step 5: Release */}
            <StepSectionCard
              title={stepTitles.release}
              state={stepStates.release}
              active={currentStep === "release"}
            >
              <div className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Publish verified results to student portals. Candidates will be able to inspect their grade, download cryptographic proofs, and verify the Merkle inclusion math.
                </p>

                <Button
                  variant="danger"
                  size="md"
                  loading={stepStates.release.status === "running"}
                  onClick={handleRelease}
                  className="w-full"
                >
                  Release Results to Student Portals
                </Button>
              </div>
            </StepSectionCard>

            {/* Complete Card */}
            {currentStep === "done" && (
              <div className="p-6 rounded-2xl bg-emerald-950/40 border border-emerald-800/80 text-center space-y-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-900/60 text-emerald-300">
                  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-semibold text-emerald-300">
                    Examination Lifecycle Completed
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    All post-exam operations have concluded. Results and Merkle inclusion proofs are live for all candidates.
                  </p>
                </div>
                <Link href="/exams">
                  <Button variant="secondary" size="sm">
                    Return to Exam Registry
                  </Button>
                </Link>
              </div>
            )}
          </div>
        </PageContainer>
      </main>

      <Footer />
    </div>
  );
}

function StepSectionCard({
  title,
  state,
  active,
  children,
}: {
  title: string;
  state: StepState;
  active: boolean;
  children: React.ReactNode;
}) {
  const isDone = state.status === "done";
  const isError = state.status === "error";
  const isRunning = state.status === "running";

  return (
    <Card
      className={`border-slate-800 transition-all ${
        isDone
          ? "border-emerald-800/60 bg-slate-900/80"
          : isError
          ? "border-red-800/60 bg-slate-900/80"
          : active
          ? "border-blue-500/60 bg-slate-900/90 shadow-lg shadow-blue-950/40"
          : "opacity-60 bg-slate-900/40"
      }`}
    >
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        <Badge
          variant={
            isDone ? "success" : isError ? "danger" : isRunning ? "info" : "default"
          }
          size="sm"
        >
          {isDone
            ? "Completed ✓"
            : isError
            ? "Error ✗"
            : isRunning
            ? "In Progress…"
            : active
            ? "Ready"
            : "Locked"}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {state.message && (
          <p
            className={`text-xs p-3 rounded-lg border font-mono ${
              isError
                ? "bg-red-950/50 border-red-800 text-red-300"
                : "bg-emerald-950/40 border-emerald-800 text-emerald-300"
            }`}
          >
            {state.message}
          </p>
        )}
        {(active || isError) && children}
      </CardContent>
    </Card>
  );
}
