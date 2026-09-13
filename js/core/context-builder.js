/**
 * NEXUSAI V5 — Dynamic System & Task Context Builder
 */

export class ContextBuilder {
    buildContext({ userMessage, conversationHistory, memories, skills, plan, observations }) {
        const sysHeader = `You are NexusAI, an autonomous multi-step reasoning AI agent.
Always analyze inputs, plan action steps, and execute appropriate tools.`;

        let contextText = "";

        if (plan && plan.length > 0) {
            contextText += `\n=== CURRENT EXECUTION PLAN ===\n`;
            plan.forEach((step, idx) => {
                contextText += `${idx + 1}. [${step.status}] ${step.goal}\n`;
            });
        }

        if (memories && memories.length > 0) {
            contextText += `\n=== RELEVANT LONG-TERM MEMORIES ===\n`;
            memories.forEach(m => {
                contextText += `- [${m.type}] ${m.key}: ${JSON.stringify(m.value)}\n`;
            });
        }

        if (skills && skills.length > 0) {
            contextText += `\n=== LOADED SKILL INSTRUCTIONS ===\n`;
            skills.forEach(s => {
                contextText += `- Skill [${s.name}]: ${s.instructions}\n`;
            });
        }

        const systemMessage = { role: "system", content: sysHeader + contextText };

        const formattedHistory = (conversationHistory || []).slice(-6).map(m => ({
            role: m.role,
            content: m.content
        }));

        return [systemMessage, ...formattedHistory, { role: "user", content: userMessage }];
    }
}
