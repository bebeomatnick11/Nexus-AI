/**
 * NEXUSAI V5 — State-based Requirement Verifier Engine
 */

export class VerifierEngine {
    verify(taskState, decision) {
        if (!decision) {
            return { status: "FAILED", reason: "Model returned empty or null decision." };
        }

        if (decision.type === "error" || decision.type === "unavailable") {
            return { status: "FAILED", reason: decision.error };
        }

        if (decision.type === "tool_calls") {
            return { status: "EXECUTING", reason: "Tool calls queued for execution." };
        }

        if (decision.type === "final") {
            // Strict Requirement Checks
            const missing = taskState.requiredActions.filter(act => !taskState.isActionCompleted(act));
            if (missing.length > 0) {
                return {
                    status: "NEEDS_REPLAN",
                    reason: `Task incomplete! Missing required execution actions: [${missing.join(", ")}]`
                };
            }

            if (!decision.text || decision.text.trim().length === 0) {
                return { status: "NEEDS_REPLAN", reason: "Final answer text was empty." };
            }

            return { status: "TASK_COMPLETE", reason: "All task requirements and actions verified successfully." };
        }

        return { status: "NEEDS_REPLAN", reason: "Unknown decision pattern." };
    }
}
