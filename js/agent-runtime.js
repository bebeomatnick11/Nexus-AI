/**
 * NEXUSAI V4 — REAL AGENT ENGINE RUNTIME
 * Fully Architecture-Compliant Autonomous Agent Runtime
 */

export const CapabilityRegistry = {
    agentLoop: true,
    toolsExecution: true,
    memorySystem: true,
    conversationRecall: true,
    verifier: true,
    debugPanel: true,
    llmInference: false // Evaluated dynamically at runtime based on Provider status
};

/**
 * TaskState — Complete state machine tracking for Agent execution
 */
export class TaskState {
    constructor(taskId, userMessage, conversationId = "default") {
        this.taskId = taskId;
        this.userMessage = userMessage;
        this.conversationId = conversationId;
        this.step = 0;
        this.maxSteps = 5;
        this.status = "INIT"; // INIT, PLANNING, EXECUTING, OBSERVING, VERIFYING, COMPLETED, FAILED, NEED_LLM
        this.plan = null;
        this.observations = [];
        this.toolCalls = [];
        this.errors = [];
        this.retrievedMemories = [];
        this.retrievedConversations = [];
        this.selectedSkills = [];
        this.finalAnswer = null;
        this.startTime = Date.now();
    }
}

/**
 * Safe Math Evaluator (No innerHTML, no eval, no new Function)
 */
export class SafeMathEvaluator {
    static evaluate(expr) {
        const sanitized = String(expr).replace(/\s+/g, "");
        if (!/^[0-9+\-*/().%^]+$/.test(sanitized)) {
            throw new Error("Invalid characters in expression. Only numbers and mathematical operators allowed.");
        }

        let tokens = [];
        let numberBuffer = "";
        for (let i = 0; i < sanitized.length; i++) {
            const ch = sanitized[i];
            if ("0123456789.".includes(ch)) {
                numberBuffer += ch;
            } else {
                if (numberBuffer.length > 0) {
                    tokens.push(parseFloat(numberBuffer));
                    numberBuffer = "";
                }
                tokens.push(ch);
            }
        }
        if (numberBuffer.length > 0) {
            tokens.push(parseFloat(numberBuffer));
        }

        return SafeMathEvaluator.parseExpression(tokens);
    }

    static parseExpression(tokens) {
        let values = [];
        let ops = [];

        const precedence = (op) => {
            if (op === "+" || op === "-") return 1;
            if (op === "*" || op === "/" || op === "%") return 2;
            if (op === "^") return 3;
            return 0;
        };

        const applyOp = () => {
            const op = ops.pop();
            const b = values.pop();
            const a = values.pop();
            if (a === undefined || b === undefined) throw new Error("Malformed expression");
            switch (op) {
                case "+": values.push(a + b); break;
                case "-": values.push(a - b); break;
                case "*": values.push(a * b); break;
                case "/": 
                    if (b === 0) throw new Error("Division by zero");
                    values.push(a / b); 
                    break;
                case "%": values.push(a % b); break;
                case "^": values.push(Math.pow(a, b)); break;
            }
        };

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            if (typeof token === "number") {
                values.push(token);
            } else if (token === "(") {
                ops.push(token);
            } else if (token === ")") {
                while (ops.length > 0 && ops[ops.length - 1] !== "(") {
                    applyOp();
                }
                ops.pop();
            } else {
                while (ops.length > 0 && precedence(ops[ops.length - 1]) >= precedence(token)) {
                    applyOp();
                }
                ops.push(token);
            }
        }

        while (ops.length > 0) {
            applyOp();
        }

        if (values.length !== 1) throw new Error("Evaluation error");
        return values[0];
    }
}

/**
 * Advanced 3-Tier Memory Engine with Deduplication / Upsert
 */
export class MemoryEngine {
    constructor() {
        this.dbName = "NexusAI_Memory_DB";
        this.dbVersion = 2;
        this.db = null;
    }

    async init() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);
            request.onerror = () => reject("IndexedDB open failed");
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains("memories")) {
                    const store = db.createObjectStore("memories", { keyPath: "id", autoIncrement: true });
                    store.createIndex("type", "type", { unique: false });
                    store.createIndex("key", "key", { unique: false });
                }
            };
        });
    }

    async store(type, key, value, importance = 1, conversationId = "default") {
        await this.init();
        const existing = await this.findByKey(key);

        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["memories"], "readwrite");
            const store = tx.objectStore("memories");
            
            const record = {
                type,
                key,
                value,
                importance,
                timestamp: new Date().toISOString(),
                lastAccessed: new Date().toISOString(),
                accessCount: existing ? (existing.accessCount || 1) + 1 : 1,
                conversationId
            };

            let req;
            if (existing) {
                record.id = existing.id;
                req = store.put(record);
            } else {
                req = store.add(record);
            }

            req.onsuccess = () => resolve(record);
            req.onerror = () => reject("Failed to store/update memory record");
        });
    }

    async findByKey(key) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(["memories"], "readonly");
            const store = tx.objectStore("memories");
            const index = store.index("key");
            const req = index.get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    }

    async getAll() {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(["memories"], "readonly");
            const store = tx.objectStore("memories");
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
    }

    async delete(id) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["memories"], "readwrite");
            const store = tx.objectStore("memories");
            const req = store.delete(Number(id));
            req.onsuccess = () => resolve(true);
            req.onerror = () => reject("Failed to delete memory");
        });
    }

    async clearAll() {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(["memories"], "readwrite");
            const store = tx.objectStore("memories");
            const req = store.clear();
            req.onsuccess = () => resolve(true);
            req.onerror = () => resolve(false);
        });
    }
}

/**
 * Memory Retriever — Lexical Scoring & Context Budgeting
 */
export class MemoryRetriever {
    constructor(memoryEngine) {
        this.memoryEngine = memoryEngine;
    }

    async retrieveRelevant(query, limit = 4) {
        const allMemories = await this.memoryEngine.getAll();
        if (!allMemories || allMemories.length === 0) return [];

        const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);

        const scored = allMemories.map(mem => {
            let score = 0;
            const textContent = `${mem.key} ${JSON.stringify(mem.value)} ${mem.type}`.toLowerCase();
            
            tokens.forEach(token => {
                if (textContent.includes(token)) score += 2;
            });

            if (mem.key && query.toLowerCase().includes(mem.key.toLowerCase())) {
                score += 5;
            }

            score += (mem.importance || 1) * 0.5;

            return { mem, score };
        });

        return scored
            .filter(item => item.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, limit)
            .map(item => item.mem);
    }
}

/**
 * Conversation Manager — Episodic History Search
 */
export class ConversationManager {
    searchConversations(query, limit = 3) {
        const raw = localStorage.getItem("NexusAI_Conversations");
        if (!raw) return [];
        try {
            const convs = JSON.parse(raw);
            const tokens = query.toLowerCase().split(/\s+/).filter(t => t.length > 1);
            const results = [];

            for (const c of convs) {
                let score = 0;
                const title = (c.title || "").toLowerCase();
                tokens.forEach(token => {
                    if (title.includes(token)) score += 3;
                });

                let sampleMsg = "";
                if (c.messages && Array.isArray(c.messages)) {
                    for (const m of c.messages) {
                        const content = (m.content || "").toLowerCase();
                        tokens.forEach(token => {
                            if (content.includes(token)) {
                                score += 1;
                                if (!sampleMsg) sampleMsg = m.content;
                            }
                        });
                    }
                }

                if (score > 0) {
                    results.push({
                        id: c.id,
                        title: c.title,
                        sample: sampleMsg ? sampleMsg.substring(0, 100) + "..." : "",
                        score
                    });
                }
            }

            return results.sort((a, b) => b.score - a.score).slice(0, limit);
        } catch (e) {
            return [];
        }
    }
}

/**
 * Skill System Registry
 */
export class SkillRegistry {
    constructor() {
        this.skills = new Map();
        this.registerDefaultSkills();
    }

    register(skill) {
        this.skills.set(skill.name, skill);
    }

    selectSkills(userMessage) {
        const selected = [];
        const msg = userMessage.toLowerCase();
        for (const [name, skill] of this.skills.entries()) {
            const isMatch = skill.capabilities.some(cap => msg.includes(cap)) ||
                            skill.triggers.some(trig => msg.includes(trig));
            if (isMatch) {
                selected.push(skill);
            }
        }
        return selected;
    }

    registerDefaultSkills() {
        this.register({
            name: "smart-work",
            description: "Break down complex architecture or software goals into structured steps.",
            triggers: ["xây dựng", "thiết kế hệ thống", "lập kế hoạch", "architecture", "system design"],
            capabilities: ["system-architecture", "task-planning"],
            instructions: "Provide modular action steps, identify dependencies, and detail implementation requirements."
        });

        this.register({
            name: "roblox-scripting",
            description: "Generate production-ready Luau scripts for Roblox development.",
            triggers: ["roblox", "luau", "localscript", "serverscript"],
            capabilities: ["game-development", "luau-scripting"],
            instructions: "Write secure Luau code using Roblox API best practices with ServerScriptService and ReplicatedStorage architecture."
        });
    }
}

/**
 * Generic Safe Tool Executor
 */
export class ToolExecutor {
    constructor(memoryEngine, conversationManager) {
        this.memoryEngine = memoryEngine;
        this.conversationManager = conversationManager;
        this.tools = new Map();
        this.registerDefaultTools();
    }

    register(name, description, inputSchema, executeFn) {
        this.tools.set(name, { name, description, inputSchema, execute: executeFn });
    }

    getDefinitions() {
        return Array.from(this.tools.values()).map(t => ({
            name: t.name,
            description: t.description,
            parameters: t.inputSchema
        }));
    }

    async execute(name, args) {
        const start = Date.now();
        if (!this.tools.has(name)) {
            return {
                ok: false,
                tool: name,
                data: null,
                durationMs: Date.now() - start,
                error: `Tool '${name}' is not registered.`
            };
        }

        try {
            const result = await Promise.race([
                this.tools.get(name).execute(args),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Tool execution timed out (10s limit)")), 10000))
            ]);

            return {
                ok: true,
                tool: name,
                data: result,
                durationMs: Date.now() - start,
                error: null
            };
        } catch (err) {
            return {
                ok: false,
                tool: name,
                data: null,
                durationMs: Date.now() - start,
                error: err.message || String(err)
            };
        }
    }

    registerDefaultTools() {
        this.register(
            "calculator",
            "Perform safe mathematical evaluations.",
            {
                type: "object",
                properties: { expression: { type: "string", description: "Math expression e.g. 123 * 456" } },
                required: ["expression"]
            },
            async ({ expression }) => {
                const res = SafeMathEvaluator.evaluate(expression);
                return { expression, result: res };
            }
        );

        this.register(
            "memory_store",
            "Store identity facts or user preferences into long-term memory DB.",
            {
                type: "object",
                properties: {
                    type: { type: "string", description: "e.g. identity, preference, fact" },
                    key: { type: "string", description: "Key name e.g. name, role" },
                    value: { type: "string", description: "Value to store" }
                },
                required: ["type", "key", "value"]
            },
            async ({ type, key, value }) => {
                return await this.memoryEngine.store(type, key, value);
            }
        );

        this.register(
            "memory_search",
            "Search facts or identity info stored in long-term memory DB.",
            {
                type: "object",
                properties: { query: { type: "string", description: "Search keyword or key name" } },
                required: ["query"]
            },
            async ({ query }) => {
                const retriever = new MemoryRetriever(this.memoryEngine);
                return await retriever.retrieveRelevant(query);
            }
        );

        this.register(
            "conversation_search",
            "Search previous conversation logs by query keyword.",
            {
                type: "object",
                properties: { keyword: { type: "string", description: "Search term" } },
                required: ["keyword"]
            },
            async ({ keyword }) => {
                return this.conversationManager.searchConversations(keyword);
            }
        );
    }
}

/**
 * Model Gateway — Real LLM Provider Abstraction
 */
export class ModelGateway {
    constructor() {
        this.provider = localStorage.getItem("NexusAI_Provider") || "openai";
        this.apiKey = localStorage.getItem("NexusAI_APIKey") || "";
        this.endpoint = localStorage.getItem("NexusAI_Endpoint") || "https://api.openai.com/v1";
        this.modelName = localStorage.getItem("NexusAI_Model") || "gpt-4o-mini";
    }

    setProvider(provider, apiKey = "", endpoint = "", modelName = "") {
        this.provider = provider;
        this.apiKey = apiKey;
        if (endpoint) this.endpoint = endpoint;
        if (modelName) this.modelName = modelName;

        localStorage.setItem("NexusAI_Provider", provider);
        localStorage.setItem("NexusAI_APIKey", apiKey);
        localStorage.setItem("NexusAI_Endpoint", this.endpoint);
        localStorage.setItem("NexusAI_Model", this.modelName);
    }

    isUsable() {
        return Boolean(this.apiKey && this.apiKey.trim().length > 0);
    }

    async generate(messages, tools = []) {
        if (!this.isUsable()) {
            return {
                type: "unavailable",
                error: "LLM Provider is not configured or missing API key. Please open Settings to configure an active LLM provider."
            };
        }

        try {
            const formattedTools = tools.length > 0 ? tools.map(t => ({
                type: "function",
                function: {
                    name: t.name,
                    description: t.description,
                    parameters: t.parameters
                }
            })) : undefined;

            const payload = {
                model: this.modelName,
                messages: messages,
                temperature: 0.2
            };

            if (formattedTools) {
                payload.tools = formattedTools;
                payload.tool_choice = "auto";
            }

            const res = await fetch(`${this.endpoint}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(`LLM API Call Failed [${res.status}]: ${errJson.error?.message || res.statusText}`);
            }

            const data = await res.json();
            const choice = data.choices?.[0]?.message;
            if (!choice) throw new Error("Empty response choice returned from LLM provider.");

            if (choice.tool_calls && choice.tool_calls.length > 0) {
                const toolCall = choice.tool_calls[0];
                let parsedArgs = {};
                try {
                    parsedArgs = JSON.parse(toolCall.function.arguments);
                } catch (e) {
                    parsedArgs = { raw: toolCall.function.arguments };
                }
                return {
                    type: "tool_call",
                    tool: toolCall.function.name,
                    args: parsedArgs,
                    rawCall: toolCall
                };
            }

            return {
                type: "final",
                text: choice.content || ""
            };

        } catch (err) {
            return {
                type: "error",
                error: err.message || String(err)
            };
        }
    }
}

/**
 * Context Builder — Strict Token & Context Budgeting
 */
export class ContextBuilder {
    buildContext({ userMessage, conversationHistory, memories, skills, tools, observations }) {
        const sysHeader = `You are NexusAI, an autonomous AI reasoning agent.
You have access to tools, memory stores, and skill definitions. Always reason step-by-step.
If you call a tool, wait for the observation result before generating the final answer.`;

        let contextText = `\n\n=== RELEVANT LONG-TERM MEMORIES ===\n`;
        if (memories && memories.length > 0) {
            memories.forEach(m => {
                contextText += `- [${m.type}] ${m.key}: ${JSON.stringify(m.value)}\n`;
            });
        } else {
            contextText += `No relevant memories found.\n`;
        }

        contextText += `\n=== LOADED SKILL INSTRUCTIONS ===\n`;
        if (skills && skills.length > 0) {
            skills.forEach(s => {
                contextText += `- Skill [${s.name}]: ${s.instructions}\n`;
            });
        } else {
            contextText += `No custom skills active.\n`;
        }

        const systemMessage = { role: "system", content: sysHeader + contextText };

        const formattedHistory = (conversationHistory || []).slice(-6).map(m => ({
            role: m.role,
            content: m.content
        }));

        const currentTurn = [{ role: "user", content: userMessage }];

        const obsMessages = [];
        if (observations && observations.length > 0) {
            observations.forEach(obs => {
                obsMessages.push({
                    role: "assistant",
                    content: `[Executed Tool: ${obs.tool}]`
                });
                obsMessages.push({
                    role: "user",
                    content: `[Observation Result]: ${JSON.stringify(obs.data || obs.error)}`
                });
            });
        }

        return [systemMessage, ...formattedHistory, ...currentTurn, ...obsMessages];
    }
}

/**
 * Verifier Engine — Evaluates Task Completion & Verification State
 */
export class VerifierEngine {
    verify(taskState, decision) {
        if (!decision) {
            return { status: "FAILED", reason: "Model returned null or undefined decision." };
        }

        if (decision.type === "error" || decision.type === "unavailable") {
            return { status: "FAILED", reason: decision.error };
        }

        if (decision.type === "final") {
            if (!decision.text || decision.text.trim().length === 0) {
                return { status: "NEEDS_REPLAN", reason: "LLM returned empty final answer." };
            }
            return { status: "TASK_COMPLETE", reason: "Final output validated successfully." };
        }

        if (decision.type === "tool_call") {
            if (!decision.tool) {
                return { status: "NEEDS_REPLAN", reason: "Tool call missing tool identifier." };
            }
            return { status: "EXECUTING", reason: "Valid tool call intent." };
        }

        return { status: "NEEDS_REPLAN", reason: "Unknown decision pattern." };
    }
}

/**
 * AgentRuntime — Autonomous Execution Loop
 */
export class AgentRuntime {
    constructor() {
        this.memoryEngine = new MemoryEngine();
        this.memoryRetriever = new MemoryRetriever(this.memoryEngine);
        this.conversationManager = new ConversationManager();
        this.skillRegistry = new SkillRegistry();
        this.toolExecutor = new ToolExecutor(this.memoryEngine, this.conversationManager);
        this.contextBuilder = new ContextBuilder();
        this.modelGateway = new ModelGateway();
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
        const llmActive = this.modelGateway.isUsable();
        CapabilityRegistry.llmInference = llmActive;
        return CapabilityRegistry;
    }

    async processUserMessage(userMessage, conversationHistory = []) {
        const taskId = `task_${Date.now()}`;
        const taskState = new TaskState(taskId, userMessage);

        this.log("REQUEST", "User", "RECEIVED", { taskId, message: userMessage });

        // Capability Status Assessment
        if (!this.modelGateway.isUsable()) {
            this.log("MODEL_UNAVAILABLE", "ModelGateway", "FAILED", {
                reason: "LLM API Key missing or provider not configured."
            });
            CapabilityRegistry.llmInference = false;
            return "⚠️ **Agent Error: LLM Provider Unavailable**\n\nNexusAI V4 requires an active LLM Provider to reason and execute tasks. Please click **Settings** to configure your OpenAI API Key or Endpoint.";
        }
        CapabilityRegistry.llmInference = true;

        // Context Retrieval Phase
        taskState.status = "PLANNING";
        const retrievedMemories = await this.memoryRetriever.retrieveRelevant(userMessage);
        taskState.retrievedMemories = retrievedMemories;

        const selectedSkills = this.skillRegistry.selectSkills(userMessage);
        taskState.selectedSkills = selectedSkills;

        this.log("CONTEXT_RETRIEVAL", "ContextBuilder", "COMPLETED", {
            memoriesRetrieved: retrievedMemories.length,
            skillsSelected: selectedSkills.map(s => s.name)
        });

        // Generic Agent Loop (Plan -> Execute -> Observe -> Verify)
        while (taskState.step < taskState.maxSteps) {
            taskState.step++;
            this.log("AGENT_LOOP", `Step ${taskState.step}`, "RUNNING", { activeStep: taskState.step });

            const contextMessages = this.contextBuilder.buildContext({
                userMessage,
                conversationHistory,
                memories: taskState.retrievedMemories,
                skills: taskState.selectedSkills,
                tools: this.toolExecutor.getDefinitions(),
                observations: taskState.observations
            });

            this.log("MODEL_REQUEST", "ModelGateway", "SENDING", { step: taskState.step });
            const decision = await this.modelGateway.generate(contextMessages, this.toolExecutor.getDefinitions());

            const verification = this.verifier.verify(taskState, decision);

            if (verification.status === "FAILED") {
                this.log("MODEL_ERROR", "ModelGateway", "FAILED", { error: verification.reason });
                taskState.finalAnswer = `⚠️ **Agent Error**: ${verification.reason}`;
                taskState.status = "FAILED";
                break;
            }

            if (decision.type === "tool_call") {
                this.log("TOOL_CALL", decision.tool, "EXECUTING", decision.args);
                taskState.toolCalls.push(decision);

                const obs = await this.toolExecutor.execute(decision.tool, decision.args);
                taskState.observations.push(obs);

                if (obs.ok) {
                    this.log("OBSERVATION", decision.tool, "SUCCESS", obs.data);
                } else {
                    this.log("OBSERVATION", decision.tool, "FAILED", obs.error);
                }
                // Loop continues: feed observation back into context for next reasoning turn
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
            this.log("LOOP_TERMINATED", "AgentRuntime", "TIMEOUT", { maxSteps: taskState.maxSteps });
            taskState.finalAnswer = "⚠️ Task execution reached maximum reasoning steps limit before concluding.";
        }

        return taskState.finalAnswer;
    }
}
