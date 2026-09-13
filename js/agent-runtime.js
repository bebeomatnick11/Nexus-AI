/**
 * NEXUSAI V5 — FULL AGENT ENGINE RUNTIME
 * Modular Orchestrator Export Entry Point
 */

import { TaskState } from "./core/task-state.js";
import { MemoryEngine, MemoryRetriever } from "./core/memory-engine.js";
import { ConversationManager } from "./core/conversation-manager.js";
import { SkillRegistry } from "./core/skill-registry.js";
import { ToolExecutor } from "./core/tool-executor.js";
import { ModelGateway } from "./core/model-gateway.js";
import { ContextBuilder } from "./core/context-builder.js";
import { TaskPlanner } from "./core/planner.js";
import { VerifierEngine } from "./core/verifier.js";

export const CapabilityRegistry = {
    agentLoop: true,
    toolsExecution: true,
    memorySystem: true,
    conversationRecall: true,
    verifier: true,
    debugPanel: true,
    llmInference: false
};

export { TaskState, MemoryEngine, ConversationManager, SkillRegistry, ToolExecutor, ModelGateway, ContextBuilder, TaskPlanner, VerifierEngine };

export class AgentRuntime {
    constructor() {
        this.memoryEngine = new MemoryEngine();
        this.memoryRetriever = new MemoryRetriever(this.memoryEngine);
        this.conversationManager = new ConversationManager();
        this.skillRegistry = new SkillRegistry();
        this.toolExecutor = new ToolExecutor(this.memoryEngine, this.conversationManager);
        this.contextBuilder = new ContextBuilder();
        this.modelGateway = new ModelGateway();
        this.planner = new TaskPlanner();
        this.verifier = new VerifierEngine();
        this.debugLogs = [];
    }

    log(type, source, status, data) {
        const entry = {
            timestamp: new Date().toLocaleTimeString(),
            type,
            source,
            status,
            data
        };
        this.debugLogs.push(entry);
        if (typeof window !== "undefined" && window.app && window.app.onDebugLog) {
            window.app.onDebugLog(entry);
        }
    }

    getCapabilitiesStatus() {
        CapabilityRegistry.llmInference = this.modelGateway.isUsable();
        return CapabilityRegistry;
    }

    async processUserMessage(userMessage, conversationHistory = []) {
        const taskId = `task_${Date.now()}`;
        const taskState = new TaskState(taskId, userMessage);

        this.log("REQUEST", "User", "RECEIVED", { taskId, message: userMessage });

        if (!this.modelGateway.isUsable()) {
            this.log("MODEL_UNAVAILABLE", "ModelGateway", "FAILED", { reason: "Provider not configured" });
            return "⚠️ **Agent Error: LLM Provider Unavailable**\n\nPlease configure your OpenAI API Key or Endpoint in Settings.";
        }

        // 1. Requirement Analysis & Task Planning
        taskState.status = "PLANNING";
        taskState.requiredActions = this.planner.analyzeRequirements(userMessage);
        taskState.plan = this.planner.createPlan(userMessage, taskState.requiredActions);

        this.log("PLANNING", "TaskPlanner", "COMPLETED", {
            requiredActions: taskState.requiredActions,
            planSteps: taskState.plan.length
        });

        // 2. Context Retrieval
        const retrievedMemories = await this.memoryRetriever.retrieveRelevant(userMessage);
        taskState.retrievedMemories = retrievedMemories;
        const selectedSkills = this.skillRegistry.selectSkills(userMessage);
        taskState.selectedSkills = selectedSkills;

        // Initialize Chat Messages Payload
        taskState.messages = this.contextBuilder.buildContext({
            userMessage,
            conversationHistory,
            memories: retrievedMemories,
            skills: selectedSkills,
            plan: taskState.plan,
            observations: taskState.observations
        });

        // 3. Autonomous Execution Loop
        while (taskState.step < taskState.maxSteps) {
            taskState.step++;
            this.log("AGENT_LOOP", `Step ${taskState.step}`, "RUNNING", { activeStep: taskState.step });

            const decision = await this.modelGateway.generate(taskState.messages, this.toolExecutor.getDefinitions());
            const verification = this.verifier.verify(taskState, decision);

            if (verification.status === "FAILED") {
                this.log("MODEL_ERROR", "ModelGateway", "FAILED", { error: verification.reason });
                taskState.finalAnswer = `⚠️ **Agent Execution Error**: ${verification.reason}`;
                taskState.status = "FAILED";
                break;
            }

            if (verification.status === "NEEDS_REPLAN") {
                this.log("VERIFICATION_FAILED", "VerifierEngine", "REPLANNING", { reason: verification.reason });
                const newPlan = this.planner.createReplan(taskState, verification.reason);
                taskState.plan.push(...newPlan);
                taskState.messages.push({
                    role: "user",
                    content: `[System Verification Warning]: ${verification.reason}. Adjust strategy and complete missing goals.`
                });
                continue;
            }

            if (decision.type === "tool_calls") {
                // Append Assistant message with tool_calls to protocol history
                taskState.messages.push(decision.rawMessage);

                // Execute Parallel Tools
                for (const call of decision.toolCalls) {
                    this.log("TOOL_CALL", call.name, "EXECUTING", call.args);
                    const obs = await this.toolExecutor.execute(call.name, call.args);
                    
                    if (obs.ok) {
                        taskState.markActionCompleted(call.name, call.args, obs.data);
                        this.log("OBSERVATION", call.name, "SUCCESS", obs.data);
                    } else {
                        taskState.markActionFailed(call.name, call.args, obs.error);
                        this.log("OBSERVATION", call.name, "FAILED", obs.error);
                    }

                    // Strict OpenAI Tool Response Protocol Insertion
                    taskState.messages.push({
                        role: "tool",
                        tool_call_id: call.id,
                        content: JSON.stringify(obs.data || { error: obs.error })
                    });
                }
                continue;
            }

            if (decision.type === "final" && verification.status === "TASK_COMPLETE") {
                this.log("VERIFICATION", "VerifierEngine", "TASK_COMPLETE", null);
                this.log("FINAL_ANSWER", "AgentRuntime", "COMPLETED", { outputLength: decision.text.length });
                taskState.finalAnswer = decision.text;
                taskState.status = "COMPLETED";
                break;
            }
        }

        if (!taskState.finalAnswer && taskState.step >= taskState.maxSteps) {
            taskState.finalAnswer = "⚠️ Task loop exceeded maximum reasoning steps budget.";
        }

        return taskState.finalAnswer;
    }
}
