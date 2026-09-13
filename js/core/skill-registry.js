/**
 * NEXUSAI V5 — Capability-Driven Skill Registry
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
            description: "Decompose complex tasks, software architecture, or business processes.",
            triggers: ["xây dựng", "thiết kế hệ thống", "lập kế hoạch", " kiến trúc"],
            capabilities: ["system-architecture", "task-planning", "architect"],
            instructions: "Decompose user goals into modular components, evaluate dependencies, and output step-by-step implementations."
        });

        this.register({
            name: "roblox-scripting",
            description: "Generate production-grade Roblox Luau code adhering to modern standards.",
            triggers: ["roblox", "luau", "localscript", "serverscript"],
            capabilities: ["game-development", "luau-scripting", "roblox-dev"],
            instructions: "Write clean, modular Roblox Luau code using ServerScriptService, ReplicatedStorage, and RemoteEvents."
        });
    }
}
