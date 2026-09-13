/**
 * NEXUSAI V5 — Generic Tool Executor
 */

import { SafeMathEvaluator } from "./safe-math.js";
import { MemoryRetriever } from "./memory-engine.js";

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
                new Promise((_, reject) => setTimeout(() => reject(new Error("Tool execution timed out (10s)")), 10000))
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
            "Perform mathematical calculations safely.",
            {
                type: "object",
                properties: { expression: { type: "string", description: "Math expression e.g. 123456 * 789" } },
                required: ["expression"]
            },
            async ({ expression }) => {
                const res = SafeMathEvaluator.evaluate(expression);
                return { expression, result: res };
            }
        );

        this.register(
            "memory_store",
            "Store user identity, facts, or answers into long-term memory DB.",
            {
                type: "object",
                properties: {
                    type: { type: "string", description: "e.g. identity, fact, calculation_result" },
                    key: { type: "string", description: "Key identifier e.g. answer, user_name" },
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
            "Retrieve facts or information from long-term memory DB.",
            {
                type: "object",
                properties: { query: { type: "string", description: "Search keyword or key identifier" } },
                required: ["query"]
            },
            async ({ query }) => {
                const retriever = new MemoryRetriever(this.memoryEngine);
                return await retriever.retrieveRelevant(query);
            }
        );

        this.register(
            "conversation_search",
            "Search previous conversation logs by query term.",
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
