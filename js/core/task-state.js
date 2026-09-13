/**
 * NEXUSAI V5 — Task State Engine
 */

export class TaskState {
    constructor(taskId, userMessage, conversationId = "default") {
        this.taskId = taskId;
        this.userMessage = userMessage;
        this.conversationId = conversationId;
        this.step = 0;
        this.maxSteps = 12;
        this.status = "INIT"; // INIT, PLANNING, EXECUTING, OBSERVING, VERIFYING, REPLANNING, COMPLETED, FAILED
        
        // Planning & Requirements
        this.plan = []; // Array of sub-goals/steps
        this.currentStepIndex = 0;
        this.requiredActions = []; // e.g., ['calculator', 'memory_store']
        this.completedActions = []; // Actions executed successfully
        this.failedActions = [];

        // Execution Trackers
        this.messages = []; // Full OpenAI-compatible chat payload for this task
        this.observations = [];
        this.toolCalls = [];
        this.errors = [];
        
        // Context Trackers
        this.retrievedMemories = [];
        this.retrievedConversations = [];
        this.selectedSkills = [];
        
        this.finalAnswer = null;
        this.startTime = Date.now();
    }

    markActionCompleted(toolName, args, result) {
        this.completedActions.push({
            tool: toolName,
            args,
            result,
            timestamp: Date.now()
        });
    }

    markActionFailed(toolName, args, error) {
        this.failedActions.push({
            tool: toolName,
            args,
            error,
            timestamp: Date.now()
        });
    }

    isActionCompleted(toolName) {
        return this.completedActions.some(a => a.tool === toolName);
    }
}
