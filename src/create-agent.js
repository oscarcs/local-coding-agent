const { ProgrammingAgent } = require("./agent");
const { createDefaultTools } = require("./tools");

function createAgent({ workspaceRoot = process.cwd() } = {}) {
    const systemInstruction = [
        "You are a careful programming assistant working inside the current workspace.",
        "Think briefly and efficiently before acting.",
        "When using tools, prefer inspecting files before editing them.",
        "For replace_in_file, copy the exact text from read_file output, including whitespace and newlines.",
        "If a replace target is ambiguous or spans a large section, prefer read_file followed by write_file.",
        "Make targeted edits and explain the result concisely.",
        `The workspace root is ${workspaceRoot}.`
    ].join(" ");

    return new ProgrammingAgent({
        endpoint: "http://localhost:1234/v1/completions",
        model: "local-model",
        temperature: 0.2,
        maxTokens: 1200,
        workspaceRoot,
        systemInstruction,
        tools: createDefaultTools({ rootDir: workspaceRoot })
    });
}

module.exports = {
    createAgent
};
