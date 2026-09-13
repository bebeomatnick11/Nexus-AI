/**
 * NEXUSAI V5 — Provider-Agnostic Model Gateway
 * Fully supports OpenAI Tool Calling semantics & Local Providers (Ollama/WebLLM)
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
        // Ollama, Local Proxies or WebLLM do not strictly require an API key
        if (this.provider === "ollama" || this.provider === "webllm" || this.endpoint.includes("localhost") || this.endpoint.includes("127.0.0.1")) {
            return true;
        }
        return Boolean(this.apiKey && this.apiKey.trim().length > 0);
    }

    async generate(messages, tools = []) {
        if (!this.isUsable()) {
            return {
                type: "unavailable",
                error: "LLM Provider missing API Key or unconfigured. Please configure your model settings."
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

            const headers = { "Content-Type": "application/json" };
            if (this.apiKey) {
                headers["Authorization"] = `Bearer ${this.apiKey}`;
            }

            const res = await fetch(`${this.endpoint}/chat/completions`, {
                method: "POST",
                headers,
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const errJson = await res.json().catch(() => ({}));
                throw new Error(`LLM Error [${res.status}]: ${errJson.error?.message || res.statusText}`);
            }

            const data = await res.json();
            const choice = data.choices?.[0]?.message;
            if (!choice) throw new Error("Empty choice payload returned from model.");

            // OpenAI Parallel Tool Calling support
            if (choice.tool_calls && choice.tool_calls.length > 0) {
                const parsedToolCalls = choice.tool_calls.map(call => {
                    let parsedArgs = {};
                    try {
                        parsedArgs = JSON.parse(call.function.arguments);
                    } catch (e) {
                        parsedArgs = { raw: call.function.arguments };
                    }
                    return {
                        id: call.id,
                        name: call.function.name,
                        args: parsedArgs
                    };
                });

                return {
                    type: "tool_calls",
                    toolCalls: parsedToolCalls,
                    rawMessage: choice
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
