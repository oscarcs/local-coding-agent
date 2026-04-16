function stringifyGemmaString(value) {
    return `<|"|>${String(value)}<|"|>`;
}

function stringifyGemmaValue(value) {
    if (value === null) {
        return "null";
    }

    if (typeof value === "string") {
        return stringifyGemmaString(value);
    }

    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }

    if (Array.isArray(value)) {
        return `[${value.map((item) => stringifyGemmaValue(item)).join(",")}]`;
    }

    if (typeof value === "object") {
        const entries = Object.entries(value)
            .filter(([, entryValue]) => typeof entryValue !== "function" && entryValue !== undefined)
            .map(([key, entryValue]) => `${formatIdentifier(key)}:${stringifyGemmaValue(entryValue)}`);
        return `{${entries.join(",")}}`;
    }

    return stringifyGemmaString(String(value));
}

function formatIdentifier(value) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(value) ? value : stringifyGemmaString(value);
}

function renderToolDeclaration(tool) {
    const payload = {
        description: tool.description,
        parameters: tool.parameters || {}
    };

    return `<|tool>\ndeclaration:${tool.name}${stringifyGemmaValue(payload)}\n<tool|>\n`;
}

function renderToolCall(call) {
    return `<|tool_call>call:${call.name}${stringifyGemmaValue(call.arguments || {})}<tool_call|>\n`;
}

function renderToolResponse(response) {
    return `<|tool_response>response:${response.name}${stringifyGemmaValue(response.response)}<tool_response|>\n`;
}

function renderSystemTurn({ instruction, tools, thinkingEnabled = true }) {
    const toolBlock = tools.map(renderToolDeclaration).join("");
    const thinkToken = thinkingEnabled ? "<|think|>" : "";
    return `<|turn>system\n${thinkToken}${instruction}\n${toolBlock}<turn|>\n`;
}

function renderUserTurn(content) {
    return `<|turn>user\n${content}<turn|>\n`;
}

function renderAssistantTurn(turn) {
    const parts = [];

    for (let index = 0; index < (turn.toolCalls || []).length; index += 1) {
        parts.push(renderToolCall(turn.toolCalls[index]));
        if (turn.toolResponses?.[index]) {
            parts.push(renderToolResponse(turn.toolResponses[index]));
        }
    }

    if (turn.content) {
        parts.push(turn.content);
    }

    return `<|turn>model\n${parts.join("")}<turn|>\n`;
}

function renderConversation({ systemInstruction, tools, history, pendingUserMessage }) {
    let prompt = renderSystemTurn({
        instruction: systemInstruction,
        tools
    });

    for (const turn of history) {
        if (turn.role === "user") {
            prompt += renderUserTurn(turn.content);
        } else if (turn.role === "assistant") {
            prompt += renderAssistantTurn(turn);
        }
    }

    if (pendingUserMessage !== undefined) {
        prompt += renderUserTurn(pendingUserMessage);
        prompt += "<|turn>model\n";
    }

    return prompt;
}

module.exports = {
    renderConversation,
    renderToolCall,
    renderToolDeclaration,
    renderToolResponse,
    stringifyGemmaString,
    stringifyGemmaValue
};
