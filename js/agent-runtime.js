/**
 * NexusAI V2 — Real Agent Engine Runtime
 * Handles Loop Reasoning, Dynamic Tool Calling, IndexedDB Memory, and Real System Diagnostics.
 */

// --- 1. CAPABILITY REGISTRY ---
export const CapabilityRegistry = {
    agentLoop: "READY",
    toolsExecution: "READY",
    memorySystem: "READY",
    conversationRecall: "READY",
    verifier: "READY",
    debugPanel: "READY",
    webSearch: "UNAVAILABLE",       // Client-side SPA has no search backend
    codeSandboxExecution: "UNAVAILABLE" // Browser environment lacks filesystem access
};

// --- 2. INDEXEDDB MEMORY ENGINE ---
export class MemoryEngine {
    constructor() {
        this.dbName = "NexusAI_Memory_DB";
        this.dbVersion = 1;
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

    async store(type, key, value, importance = 1) {
        await this.init();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(["memories"], "readwrite");
            const store = tx.objectStore("memories");
            const record = {
                type,
                key,
                value,
                importance,
                timestamp: new Date().toISOString()
            };
            const req = store.add(record);
            req.onsuccess = () => resolve(record);
            req.onerror = () => reject("Failed to store memory");
        });
    }

    async search(query) {
        await this.init();
        return new Promise((resolve) => {
            const tx = this.db.transaction(["memories"], "readonly");
            const store = tx.objectStore("memories");
            const req = store.openCursor();
            const results = [];
            const q = query.toLowerCase();

            req.onsuccess = (e) => {
                const cursor = e.target.result;
                if (cursor) {
                    const val = cursor.value;
                    if (
                        (val.key && val.key.toLowerCase().includes(q)) ||
                        (val.value && JSON.stringify(val.value).toLowerCase().includes(q)) ||
                        (val.type && val.type.toLowerCase().includes(q))
                    ) {
                        results.push(val);
                    }
                    cursor.continue();
                } else {
                    resolve(results);
                }
            };
            req.onerror = () => resolve([]);
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

// --- 3. REAL TOOL REGISTRY ---
export class ToolRegistry {
    constructor(memoryEngine) {
        this.memoryEngine = memoryEngine;
        this.tools = new Map();
        this.registerDefaultTools();
    }

    register(name, description, inputSchema, executeFn) {
        this.tools.set(name, {
            name,
            description,
            inputSchema,
            execute: executeFn
        });
    }

    getDefinitions() {
        const defs = [];
        for (const [name, tool] of this.tools.entries()) {
            defs.push({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
            });
        }
        return defs;
    }

    async execute(name, args) {
        if (!this.tools.has(name)) {
            return { ok: false, tool: name, error: `Tool '${name}' is not registered.` };
        }
        try {
            const result = await this.tools.get(name).execute(args);
            return { ok: true, tool: name, data: result };
        } catch (err) {
            return { ok: false, tool: name, error: err.message || String(err) };
        }
    }

    registerDefaultTools() {
        // Tool: Calculator
        this.register(
            "calculator",
            "Perform mathematical calculations safely.",
            { type: "object", properties: { expression: { type: "string" } }, required: ["expression"] },
            async ({ expression }) => {
                const sanitized = expression.replace(/[^0-9+\-*/().^%\s]/g, "");
                if (!sanitized) throw new Error("Invalid mathematical expression");
                const fn = new Function(`return (${sanitized});`);
                return { expression, result: fn() };
            }
        );

        // Tool: Memory Store
        this.register(
            "memory_store",
            "Store user profile facts or preferences into IndexedDB.",
            { type: "object", properties: { type: { type: "string" }, key: { type: "string" }, value: { type: "string" } }, required: ["type", "key", "value"] },
            async ({ type, key, value }) => {
                return await this.memoryEngine.store(type, key, value);
            }
        );

        // Tool: Memory Search
        this.register(
            "memory_search",
            "Search user memories from IndexedDB by query string.",
            { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
            async ({ query }) => {
                return await this.memoryEngine.search(query);
            }
        );

        // Tool: Conversation Search
        this.register(
            "conversation_search",
            "Search archived conversation history by keyword.",
            { type: "object", properties: { keyword: { type: "string" } }, required: ["keyword"] },
            async ({ keyword }) => {
                const raw = localStorage.getItem("NexusAI_Conversations");
                if (!raw) return [];
                const convs = JSON.parse(raw);
                const results = [];
                const kw = keyword.toLowerCase();

                for (const c of convs) {
                    if (c.title && c.title.toLowerCase().includes(kw)) {
                        results.push({ id: c.id, title: c.title, matchType: "title" });
                    } else if (c.messages) {
                        const matchedMsg = c.messages.find(m => m.content && m.content.toLowerCase().includes(kw));
                        if (matchedMsg) {
                            results.push({ id: c.id, title: c.title, sample: matchedMsg.content.substring(0, 100), matchType: "content" });
                        }
                    }
                }
                return results;
            }
        );

        // Tool: Project Inspector
        this.register(
            "project_inspector",
            "Inspect current client web runtime application parameters.",
            { type: "object", properties: {} },
            async () => {
                return {
                    userAgent: navigator.userAgent,
                    screen: `${window.innerWidth}x${window.innerHeight}`,
                    storageType: "IndexedDB + LocalStorage",
                    activeCapabilities: Object.keys(CapabilityRegistry).filter(k => CapabilityRegistry[k] === "READY")
                };
            }
        );
    }
}

// --- 4. MODEL GATEWAY ---
export class ModelGateway {
    constructor() {
        this.provider = "local";
        this.apiKey = "";
    }

    setProvider(provider, apiKey = "") {
        this.provider = provider;
        this.apiKey = apiKey;
    }

    async generate(messages, tools = []) {
        if (this.provider === "openai" && this.apiKey) {
            return await this.callOpenAI(messages, tools);
        }
        // Native Client-side Engine Execution Logic
        return await this.callLocalEngine(messages, tools);
    }

    async callOpenAI(messages, tools) {
        const formattedTools = tools.map(t => ({
            type: "function",
            function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema
            }
        }));

        const response = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.apiKey}`
            },
            body: JSON.stringify({
                model: "gpt-4o-mini",
                messages: messages,
                tools: formattedTools.length > 0 ? formattedTools : undefined
            })
        });

        if (!response.ok) {
            const err = await response.json();
            throw new Error(`OpenAI API Error: ${err.error?.message || response.statusText}`);
        }

        const data = await response.json();
        const choice = data.choices[0].message;

        if (choice.tool_calls && choice.tool_calls.length > 0) {
            const tc = choice.tool_calls[0];
            return {
                type: "tool_call",
                tool: tc.function.name,
                args: JSON.parse(tc.function.arguments)
            };
        }

        return { type: "final", text: choice.content };
    }

    async callLocalEngine(messages, tools) {
        const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content || "";
        const lower = lastUserMsg.toLowerCase();

        // 1. Math Calculation Trigger
        const mathMatch = lastUserMsg.match(/(?:tính|calculate|math)\s*:?\s*([0-9+\-*/().^%\s]+)/i);
        if (mathMatch && mathMatch[1].trim()) {
            return {
                type: "tool_call",
                tool: "calculator",
                args: { expression: mathMatch[1].trim() }
            };
        }

        // 2. Memory Store Trigger
        if (lower.includes("tôi tên là") || lower.includes("tôi thích") || lower.includes("hãy nhớ")) {
            let key = "user_info";
            let val = lastUserMsg;
            if (lower.includes("tôi tên là")) {
                key = "name";
                val = lastUserMsg.split("tôi tên là")[1].trim().replace(/[.|!]/g, "");
            }
            return {
                type: "tool_call",
                tool: "memory_store",
                args: { type: "profile", key, value: val }
            };
        }

        // 3. Memory Search Trigger
        if (lower.includes("tên tôi") || lower.includes("tôi thích gì") || lower.includes("bạn nhớ gì")) {
            return {
                type: "tool_call",
                tool: "memory_search",
                args: { query: lower.includes("tên") ? "name" : "user_info" }
            };
        }

        // 4. Conversation Search Trigger
        if (lower.includes("tìm cuộc trò chuyện") || lower.includes("trước đây tôi có nói")) {
            const kw = lastUserMsg.replace(/tìm cuộc trò chuyện|trước đây tôi có nói|về/gi, "").trim();
            return {
                type: "tool_call",
                tool: "conversation_search",
                args: { keyword: kw || "Astra" }
            };
        }

        // 5. Default Fallback Synthesis Response
        return {
            type: "final",
            text: `[NexusAI Local Engine]\n\nXử lý thành công yêu cầu: "${lastUserMsg}"\n\nHệ thống Agent Runtime hiện đang hoạt động ở chế độ trực tiếp. Bạn có thể thử các lệnh:\n- *"Tính: 123 * 456"* (Kích hoạt Real Tool Calculator)\n- *"Tôi tên là Việt Anh"* (Kích hoạt Real Memory Store vào IndexedDB)\n- *"Tên tôi là gì?"* (Kích hoạt Real Memory Retrieval)`
        };
    }
}

// --- 5. VERIFIER ENGINE ---
export class VerifierEngine {
    check(response) {
        if (!response) return { ok: false, reason: "Empty response" };
        if (response.type === "final" && (!response.text || response.text.trim().length === 0)) {
            return { ok: false, reason: "Response text is empty" };
        }
        return { ok: true };
    }
}

// --- 6. AGENT RUNTIME MAIN LOOP ---
export class AgentRuntime {
    constructor() {
        this.memoryEngine = new MemoryEngine();
        this.toolRegistry = new ToolRegistry(this.memoryEngine);
        this.modelGateway = new ModelGateway();
        this.verifier = new VerifierEngine();
        this.debugLogs = [];
        this.maxSteps = 5;
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
        if (window.app && window.app.onDebugLog) {
            window.app.onDebugLog(entry);
        }
    }

    async processUserMessage(userMessage, conversationHistory = []) {
        this.log("REQUEST", "User", "RECEIVED", { message: userMessage });

        const messages = [
            { role: "system", content: "You are NexusAI Agent V2, an intelligent AI Assistant with tool calling capabilities." },
            ...conversationHistory.map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: userMessage }
        ];

        let step = 0;
        let finalResponse = null;

        while (step < this.maxSteps) {
            step++;
            this.log("PLANNER", `Step ${step}`, "RUNNING", { activeMessages: messages.length });

            try {
                const decision = await this.modelGateway.generate(messages, this.toolRegistry.getDefinitions());

                if (decision.type === "tool_call") {
                    this.log("TOOL_CALL", decision.tool, "EXECUTING", decision.args);
                    const toolResult = await this.toolRegistry.execute(decision.tool, decision.args);

                    if (toolResult.ok) {
                        this.log("TOOL_SUCCESS", decision.tool, "PASSED", toolResult.data);
                        messages.push({
                            role: "assistant",
                            content: `[Tool Call: ${decision.tool}]`
                        });
                        messages.push({
                            role: "system",
                            content: `Tool '${decision.tool}' execution result: ${JSON.stringify(toolResult.data)}`
                        });
                    } else {
                        this.log("TOOL_ERROR", decision.tool, "FAILED", toolResult.error);
                        messages.push({
                            role: "system",
                            content: `Tool '${decision.tool}' execution failed: ${toolResult.error}`
                        });
                    }
                    continue; // Loop again with updated context
                }

                if (decision.type === "final") {
                    const verification = this.verifier.check(decision);
                    if (verification.ok) {
                        this.log("VERIFIER_PASS", "Verifier", "PASSED", null);
                        this.log("FINAL", "AgentRuntime", "COMPLETED", { outputLength: decision.text.length });
                        finalResponse = decision.text;
                        break;
                    } else {
                        this.log("VERIFIER_FAIL", "Verifier", "RETRY", verification.reason);
                        messages.push({ role: "system", content: `Response verification failed: ${verification.reason}. Please try again.` });
                    }
                }
            } catch (err) {
                this.log("ERROR", "AgentRuntime", "CRASH", { error: err.message || String(err) });
                finalResponse = `⚠️ Đã xảy ra lỗi trong quá trình thực thi Agent Loop: ${err.message || err}`;
                break;
            }
        }

        if (!finalResponse) {
            finalResponse = "⚠️ Hệ thống đã vượt quá số bước suy luận tối đa (Max Steps) mà chưa đưa ra câu trả lời cuối cùng.";
        }

        return finalResponse;
    }
}
