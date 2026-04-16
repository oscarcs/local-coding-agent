const fs = require("fs");
const path = require("path");

function resolveWorkspaceRoot(argv, { cwd = process.cwd() } = {}) {
    const parsed = parseCliArgs(argv);
    const requestedDirectory = parsed.directory ?? cwd;
    const workspaceRoot = path.resolve(cwd, requestedDirectory);

    validateWorkspaceRoot(workspaceRoot);

    return {
        workspaceRoot,
        extras: parsed.extras
    };
}

function parseCliArgs(argv = []) {
    let directory;
    const extras = [];

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];

        if (argument === "--directory" || argument === "--dir") {
            const value = argv[index + 1];
            if (!value || value.startsWith("--")) {
                throw new Error(`Missing value for ${argument}.`);
            }
            directory = value;
            index += 1;
            continue;
        }

        if (argument.startsWith("--directory=")) {
            directory = argument.slice("--directory=".length);
            continue;
        }

        if (argument.startsWith("--dir=")) {
            directory = argument.slice("--dir=".length);
            continue;
        }

        extras.push(argument);
    }

    return { directory, extras };
}

function validateWorkspaceRoot(workspaceRoot) {
    let stats;

    try {
        stats = fs.statSync(workspaceRoot);
    } catch (error) {
        if (error.code === "ENOENT") {
            throw new Error(`Workspace directory does not exist: ${workspaceRoot}`);
        }
        throw error;
    }

    if (!stats.isDirectory()) {
        throw new Error(`Workspace path is not a directory: ${workspaceRoot}`);
    }
}

module.exports = {
    resolveWorkspaceRoot
};
