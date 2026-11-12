/**
 * Time-gate utility — enforces exam window
 * Used by API routes to block access outside the scheduled window.
 */

export interface TimeGateResult {
  allowed: boolean;
  reason?: string;
  secondsRemaining?: number;
}

export function checkExamWindow(
  startTime: Date,
  endTime: Date,
  durationMins: number
): TimeGateResult {
  const now = new Date();

  if (now < startTime) {
    const secondsToStart = Math.ceil((startTime.getTime() - now.getTime()) / 1000);
    return {
      allowed: false,
      reason: `Exam has not started yet. Starts in ${Math.ceil(secondsToStart / 60)} minute(s).`,
      secondsRemaining: secondsToStart,
    };
  }

  if (now > endTime) {
    return { allowed: false, reason: "Exam window has closed." };
  }

  const secondsRemaining = Math.ceil((endTime.getTime() - now.getTime()) / 1000);
  return { allowed: true, secondsRemaining };
}

/** Remaining time in seconds for a student's personal timer */
export function getRemainingTime(sessionStartedAt: Date, durationMins: number): number {
  const elapsed = (Date.now() - sessionStartedAt.getTime()) / 1000;
  return Math.max(0, durationMins * 60 - elapsed);
}
