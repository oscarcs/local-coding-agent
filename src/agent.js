const EventEmitter = require("events");
const { renderConversation, renderToolResponse } = require("./gemma-format");
const { extractThoughtBlocks, parseToolCallFromText, stripThoughtBlocks } = require("./gemma-parse");
const { requestCompletion } = require("./llm");

class ProgrammingAgent extends EventEmitter {
    constructor({
        endpoint,
        model,
        temperature,
        maxTokens,
        workspaceRoot,
        systemInstruction,
        tools,
        complete = requestCompletion
    }) {
        super();
        this.endpoint = endpoint;
        this.model = model;
        this.temperature = temperature;
        this.maxTokens = maxTokens;
        this.workspaceRoot = workspaceRoot;
        this.systemInstruction = systemInstruction;
        this.tools = tools;
        this.complete = complete;
        this.history = [];
        this.isBusy = false;
    }

    async submitUserMessage(content) {
        if (this.isBusy) {
            throw new Error("Agent is already working.");
        }

        this.isBusy = true;
        this.emit("status", "Thinking");

        const assistantTurn = {
            role: "assistant",
            toolCalls: [],
            toolResponses: [],
            content: ""
        };

        const userTurn = { role: "user", content };
        let prompt = renderConversation({
            systemInstruction: this.systemInstruction,
            tools: this.tools,
            history: this.history,
            pendingUserMessage: content
        });

        try {
            while (true) {
                const generatedText = await this.complete({
                    endpoint: this.endpoint,
                    model: this.model,
                    prompt,
                    temperature: this.temperature,
                    maxTokens: this.maxTokens
                });

                const thoughts = extractThoughtBlocks(generatedText);
                for (const thought of thoughts) {
                    this.emit("thought", thought);
                }

                const visibleText = stripThoughtBlocks(generatedText);
                const toolCall = this.extractStandaloneToolCall(visibleText);

                if (toolCall) {
                    assistantTurn.toolCalls.push(toolCall);
                    this.emit("tool_call", toolCall);
                    prompt += `${generatedText}${generatedText.endsWith("\n") ? "" : "\n"}`;

                    const toolResult = await this.executeTool(toolCall);
                    assistantTurn.toolResponses.push(toolResult);
                    prompt += renderToolResponse(toolResult);
                    continue;
                }

                assistantTurn.content = visibleText.trim();

                if (!assistantTurn.content && assistantTurn.toolResponses.length > 0) {
                    assistantTurn.content = await this.generateFallbackAnswer(content, assistantTurn);
                }

                this.history.push(userTurn, assistantTurn);
                prompt += `${generatedText}<turn|>\n`;
                this.emit("assistant_message", assistantTurn.content);
                this.emit("status", "Idle");
                return assistantTurn;
            }
        } finally {
            this.isBusy = false;
            this.emit("idle");
        }
    }

    async executeTool(toolCall) {
        const tool = this.tools.find((entry) => entry.name === toolCall.name);

        if (!tool) {
            const response = {
                name: toolCall.name,
                response: { error: `Unknown tool: ${toolCall.name}` }
            };
            this.emit("tool_result", response);
            return response;
        }

        this.emit("status", `Running ${toolCall.name}`);

        try {
            const result = await tool.run(toolCall.arguments || {});
            const response = {
                name: toolCall.name,
                response: result
            };
            this.emit("tool_result", response);
            this.emit("status", "Thinking");
            return response;
        } catch (error) {
            const response = {
                name: toolCall.name,
                response: { error: error.message }
            };
            this.emit("tool_result", response);
            this.emit("status", "Thinking");
            return response;
        }
    }

    async generateFallbackAnswer(userContent, assistantTurn) {
        this.emit("status", "Recovering final answer");

        const toolSummary = JSON.stringify({
            toolCalls: assistantTurn.toolCalls,
            toolResponses: assistantTurn.toolResponses
        });

        const fallbackPrompt = renderConversation({
            systemInstruction: [
                this.systemInstruction,
                "You are recovering a missing final answer after tool use.",
                "Do not call tools.",
                "Answer the original request directly in concise prose."
            ].join(" "),
            tools: [],
            history: [],
            pendingUserMessage: [
                "Original user request:",
                userContent,
                "",
                "Completed tool activity:",
                toolSummary,
                "",
                "Write the final answer for the user."
            ].join("\n")
        });

        const generatedText = await this.complete({
            endpoint: this.endpoint,
            model: this.model,
            prompt: fallbackPrompt,
            temperature: this.temperature,
            maxTokens: this.maxTokens
        });

        const recovered = stripThoughtBlocks(generatedText).trim();
        this.emit("status", "Thinking");
        return recovered || "I completed the tool call, but no final answer was generated.";
    }

    extractStandaloneToolCall(visibleText) {
        if (!visibleText.includes("<|tool_call>")) {
            return null;
        }

        const toolTokenIndex = visibleText.indexOf("<|tool_call>");
        const prefix = visibleText.slice(0, toolTokenIndex).trim();

        try {
            const parsed = parseToolCallFromText(visibleText);
            const suffix = visibleText.slice(parsed.end).trim();

            if (suffix.length > 0) {
                return null;
            }

            return {
                name: parsed.name,
                arguments: parsed.arguments
            };
        } catch (error) {
            if (prefix.length > 0) {
                return null;
            }
            throw error;
        }
    }

    clearHistory() {
        this.history = [];
        this.emit("status", "Idle");
    }
}

module.exports = {
    ProgrammingAgent
};
