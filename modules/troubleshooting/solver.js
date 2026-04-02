const axios = require('axios');

class TroubleshootingAI {
    constructor() {
        this.ollamaUrl = process.env.OLLAMA_URL || 'http://localhost:11434';
        this.model = process.env.OLLAMA_MODEL || 'mistral';
    }

    async solve(problem) {
        try {
            const response = await axios.post(`${this.ollamaUrl}/api/generate`, {
                model: this.model,
                prompt: `You are a helpful troubleshooting assistant. A user has the following problem: "${problem}". Provide clear, step-by-step instructions to solve this problem. Be concise and practical.`,
                stream: false
            }, { timeout: 120000 });

            return {
                solution: response.data.response,
                steps: this.parseSteps(response.data.response)
            };
        } catch (error) {
            // Fallback if Ollama is not running
            return {
                solution: `I was unable to connect to the AI model to solve: "${problem}". Please make sure Ollama is running locally, or check back when the cloud AI is connected.`,
                steps: []
            };
        }
    }

    parseSteps(text) {
        const lines = text.split('\n').filter(l => l.trim());
        const steps = [];
        lines.forEach(line => {
            if (/^\d+[\.\)]/.test(line.trim()) || /^[-*]/.test(line.trim())) {
                steps.push(line.replace(/^\d+[\.\)]\s*/, '').replace(/^[-*]\s*/, '').trim());
            }
        });
        return steps;
    }
}

module.exports = TroubleshootingAI;