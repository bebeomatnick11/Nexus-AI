/**
 * NEXUSAI V5 — Episodic Conversation Manager
 */

export class ConversationManager {
    searchConversations(query, limit = 4) {
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
                        sample: sampleMsg ? sampleMsg.substring(0, 120) + "..." : "",
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
