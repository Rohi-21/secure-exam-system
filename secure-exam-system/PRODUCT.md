# PRODUCT.md — Secure Online Examination System

## Product Identity

**Name:** CNS Secure Exam System  
**Institution:** KLE Technological University  
**Domain:** Academic examination security  
**Purpose:** Demonstrate research-grade cryptographic architecture through a fully functional online examination platform

## Users

| Role | Primary Task | Success Looks Like |
|---|---|---|
| Student | Take a secure exam, trust the submission is recorded | Exam finishes, submission confirmed, result verifiable |
| Examiner | Create and manage exams, finalize results | Exam lifecycle from creation to graded results |
| Admin | Monitor system integrity, provision users | Audit chain intact, keys managed, identities controlled |
| HOD | Oversee departmental exam integrity | Audit chain verified, results released |

## Mode

**Operate** — All surfaces are task-completion surfaces. The user is always doing something: authenticating, answering, verifying, managing. Design serves the task, not the brand. Familiarity earns trust. The interface disappears into the work.

Exception: homepage (/) is **Persuade** — it must communicate the system's cryptographic depth to professors reviewing the project.

## Visual World

- **Dark surface:** slate-950 (body), slate-900 (cards), slate-800 (subtle elements)
- **Accent:** blue-600 primary action, emerald-500 success/verified, red-500 error/danger, amber-500 warning
- **Typography:** System sans-serif, single family throughout. No display fonts in UI controls.
- **Semantic color vocabulary:** emerald = verified/secure, blue = primary action/selection, amber = warning/timing, red = error/danger, purple = cryptographic proof (Merkle roots, hashes)
- **Density:** Moderate. This is a task tool used under time pressure (exams). Information must scan instantly.

## Critical UX Principles

1. **Exam interface is distraction-free.** No decoration during active examination. Timer is always visible. Progress always visible. Submit requires confirmation.
2. **Security indicators must communicate, not decorate.** Badges showing "ECDH Active", "ECDSA Signed" are genuinely informative to the evaluating professors. They are not ornamentation.
3. **Cryptographic verification results are the centrepiece of the results page.** A student showing a professor "my Merkle proof verified in my browser" is the proof of concept.
4. **Trust through consistency.** Same button shapes, same badge vocabulary, same icon style across all screens.

## Non-Goals

- Branding personality or playfulness
- Marketing copy or persuasion patterns on task surfaces
- Heavy animation (exam interface: zero; other surfaces: state-change only, 150-250ms)
