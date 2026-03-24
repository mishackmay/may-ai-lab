const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));

class TroubleshootingAI {
    constructor() {
        this.ollamaUrl = 'http://localhost:11434/api/generate';
        this.model = process.env.OLLAMA_MODEL || 'mistral';
    }

    async solve(problem) {
        try {
            const result = await this.askAI(problem);

            return {
                questions: result.questions,
                steps: result.steps
            };

        } catch (error) {
            console.error("SOLVE ERROR:", error.message);

            return {
                questions: ["Can you explain the issue in more detail?"],
                steps: [
                    { title: "Restart Device", description: "Turn it off and on again." },
                    { title: "Check Connections", description: "Ensure all cables are properly connected." }
                ]
            };
        }
    }

    async askAI(problem) {
        const response = await fetch(this.ollamaUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: this.model,
                prompt: `
You are a professional IT technician.

STRICT RULES:
- ALWAYS ask 1-2 diagnostic questions FIRST
- THEN provide troubleshooting steps
- DO NOT skip questions
- DO NOT add explanations outside JSON
- OUTPUT MUST BE VALID JSON ONLY

FORMAT:

{
  "questions": [
    "Question 1",
    "Question 2"
  ],
  "steps": [
    {"title": "Step 1", "description": "..."},
    {"title": "Step 2", "description": "..."}
  ]
}

User problem: ${problem}
                `,
                stream: false,
                temperature: 0
            })
        });

        const data = await response.json();

        // 🔍 DEBUG: See EXACTLY what Ollama returns
        console.log("=== AI RAW RESPONSE ===");
        console.log(data.response);
        console.log("=======================");

        try {
            // Extract JSON safely
            const match = data.response.match(/\{[\s\S]*\}/);

            if (!match) throw new Error("No JSON found");

            const parsed = JSON.parse(match[0]);

            // Validate structure
            if (!parsed.questions || !parsed.steps) {
                throw new Error("Invalid structure");
            }

            return parsed;

        } catch (err) {
            console.error("JSON PARSE FAILED:", err.message);

            // 🔁 Fallback if AI fails
            return {
                questions: ["Can you describe the issue more clearly?"],
                steps: [
                    { title: "Restart Device", description: "Turn it off and on again." },
                    { title: "Check Connections", description: "Ensure everything is properly connected." }
                ]
            };
        }
    }
}

module.exports = TroubleshootingAI;