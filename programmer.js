const path = require("path");
const { resolveWorkspaceRoot } = require("./src/cli");
const { createAgent } = require("./src/create-agent");
const { startTui } = require("./src/tui");

try {
    const { workspaceRoot, extras } = resolveWorkspaceRoot(process.argv.slice(2));

    if (extras.length > 0) {
        throw new Error(`Unknown arguments: ${extras.join(", ")}`);
    }

    const agent = createAgent({ workspaceRoot });

    startTui({
        agent,
        title: `programmer.js  ${path.basename(workspaceRoot)}`
    });
} catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
}
