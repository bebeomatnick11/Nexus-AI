/**
 * NEXUSAI V5 — Dynamic Task Decomposition & Re-Planner
 */

export class TaskPlanner {
    analyzeRequirements(userMessage) {
        const required = [];
        const msg = userMessage.toLowerCase();

        if (/(tính|cộng|trừ|nhân|chia|math|\*|\+|\/)/i.test(msg) && /[0-9]/.test(msg)) {
            required.push("calculator");
        }

        if (/(lưu|ghi nhớ|nhớ giúp|store memory)/i.test(msg)) {
            required.push("memory_store");
        }

        if (/(tên tôi|tên mình|bạn nhớ gì|tìm ký ức)/i.test(msg)) {
            required.push("memory_search");
        }

        if (/(nói về|thảo luận|lịch sử|hôm trước)/i.test(msg)) {
            required.push("conversation_search");
        }

        return required;
    }

    createPlan(userMessage, requiredActions) {
        const plan = [];

        if (requiredActions.length > 0) {
            requiredActions.forEach(act => {
                plan.push({ goal: `Execute required action '${act}'`, tool: act, status: "PENDING" });
            });
            plan.push({ goal: "Synthesize observations into final response", tool: null, status: "PENDING" });
        } else {
            plan.push({ goal: "Direct reasoning and response", tool: null, status: "PENDING" });
        }

        return plan;
    }

    createReplan(taskState, failureReason) {
        taskState.status = "REPLANNING";
        const newPlan = [];
        
        // Error Recovery Strategy
        if (failureReason.includes("conversation_search")) {
            newPlan.push({
                goal: "Broaden search scope or query alternate terms for conversation search",
                tool: "conversation_search",
                status: "PENDING"
            });
        } else if (failureReason.includes("memory_store")) {
            newPlan.push({
                goal: "Retry memory storage with explicit fallback keys",
                tool: "memory_store",
                status: "PENDING"
            });
        } else {
            newPlan.push({
                goal: "Fallback reasoning to complete task despite tool failure",
                tool: null,
                status: "PENDING"
            });
        }

        return newPlan;
    }
}
