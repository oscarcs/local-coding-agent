const readline = require("readline");
const util = require("util");
const { resolveWorkspaceRoot } = require("./src/cli");
const { createAgent } = require("./src/create-agent");

try {
    const { workspaceRoot, extras } = resolveWorkspaceRoot(process.argv.slice(2));

    if (extras.length > 0) {
        throw new Error(`Unknown arguments: ${extras.join(", ")}`);
    }

    const agent = createAgent({ workspaceRoot });

    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "debug> "
    });

    function printBlock(label, value) {
        console.log(`\n[${label}]`);
        if (typeof value === "string") {
            console.log(value);
            return;
        }
        console.log(util.inspect(value, {
            depth: 4,
            colors: false,
            breakLength: 100,
            maxArrayLength: 30
        }));
    }

    agent.on("status", (status) => {
        printBlock("status", status);
    });

    agent.on("thought", (thought) => {
        printBlock("thought", thought);
    });

    agent.on("tool_call", (toolCall) => {
        printBlock("tool_call", toolCall);
    });

    agent.on("tool_result", (toolResult) => {
        printBlock("tool_result", toolResult);
    });

    agent.on("assistant_message", (message) => {
        printBlock("assistant", message);
    });

    console.log("Debug agent REPL");
    console.log("Commands: /quit, /clear, /history");
    rl.prompt();

    rl.on("line", async (line) => {
        const input = line.trim();

        if (!input) {
            rl.prompt();
            return;
        }

        if (input === "/quit") {
            rl.close();
            return;
        }

        if (input === "/clear") {
            agent.clearHistory();
            printBlock("system", "Conversation cleared.");
            rl.prompt();
            return;
        }

        if (input === "/history") {
            printBlock("history", agent.history);
            rl.prompt();
            return;
        }

        try {
            await agent.submitUserMessage(input);
        } catch (error) {
            printBlock("error", error.message);
        }

        rl.prompt();
    });

    rl.on("close", () => {
        console.log("\nExiting.");
        process.exit(0);
    });
} catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
}
