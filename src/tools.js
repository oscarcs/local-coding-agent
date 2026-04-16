const fs = require("fs").promises;
const path = require("path");
const { exec } = require("child_process");
const { promisify } = require("util");

const execAsync = promisify(exec);
const MAX_READ_FILE_TOKENS = 10000;
const ESTIMATED_BYTES_PER_TOKEN = 4;

function createDefaultTools({ rootDir }) {
    return [
        {
            name: "list_files",
            description: "List files in a directory relative to the workspace root.",
            parameters: {
                path: "string"
            },
            run: async ({ path: targetPath = "." }) => {
                const absolutePath = resolveWorkspacePath(rootDir, targetPath);
                const entries = await fs.readdir(absolutePath, { withFileTypes: true });
                return entries.map((entry) => ({
                    name: entry.name,
                    type: entry.isDirectory() ? "directory" : "file"
                }));
            }
        },
        {
            name: "read_file",
            description: "Read a UTF-8 file relative to the workspace root. Rejects files estimated above 10,000 tokens.",
            parameters: {
                path: "string"
            },
            run: async ({ path: targetPath }) => {
                if (!targetPath) {
                    throw new Error("Missing path.");
                }

                const absolutePath = resolveWorkspacePath(rootDir, targetPath);
                const stats = await fs.stat(absolutePath);
                const estimatedTokens = estimateTokenCount(stats.size);

                if (estimatedTokens > MAX_READ_FILE_TOKENS) {
                    throw new Error(
                        `File is too large to read safely: estimated ${estimatedTokens} tokens exceeds limit of ${MAX_READ_FILE_TOKENS}.`
                    );
                }

                const content = await fs.readFile(absolutePath, "utf8");
                return { path: normalizeOutputPath(rootDir, absolutePath), content };
            }
        },
        {
            name: "write_file",
            description: "Write a UTF-8 file relative to the workspace root, creating parent directories when needed.",
            parameters: {
                path: "string",
                content: "string"
            },
            run: async ({ path: targetPath, content }) => {
                if (!targetPath) {
                    throw new Error("Missing path.");
                }

                const absolutePath = resolveWorkspacePath(rootDir, targetPath);
                await fs.mkdir(path.dirname(absolutePath), { recursive: true });
                await fs.writeFile(absolutePath, content ?? "", "utf8");
                return { path: normalizeOutputPath(rootDir, absolutePath), bytes: Buffer.byteLength(content ?? "", "utf8") };
            }
        },
        {
            name: "replace_in_file",
            description: "Replace exact text inside a UTF-8 file relative to the workspace root. The search value must match the file content exactly, including spaces and newlines. Use text copied from read_file. If multiple matches exist, set all=true or use a more specific search string.",
            parameters: {
                path: "string",
                search: "string",
                replace: "string",
                all: "boolean"
            },
            run: async ({ path: targetPath, search, replace = "", all = false }) => {
                if (!targetPath || !search) {
                    throw new Error("Missing path or search.");
                }

                const absolutePath = resolveWorkspacePath(rootDir, targetPath);
                const content = await fs.readFile(absolutePath, "utf8");
                const occurrences = content.split(search).length - 1;

                if (occurrences === 0) {
                    throw new Error("Search string not found. The match must be exact, including whitespace and line breaks.");
                }

                if (!all && occurrences > 1) {
                    throw new Error(
                        `Search string matched ${occurrences} times. Provide a more specific search string or set all=true.`
                    );
                }

                const nextContent = all ? content.split(search).join(replace) : content.replace(search, replace);
                await fs.writeFile(absolutePath, nextContent, "utf8");

                return {
                    path: normalizeOutputPath(rootDir, absolutePath),
                    replacements: all ? occurrences : 1
                };
            }
        },
        {
            name: "run_command",
            description: "Run a shell command inside the workspace root with a short timeout.",
            parameters: {
                command: "string"
            },
            run: async ({ command }) => {
                if (!command) {
                    throw new Error("Missing command.");
                }

                const { stdout, stderr } = await execAsync(command, {
                    cwd: rootDir,
                    timeout: 15000,
                    maxBuffer: 256 * 1024,
                    shell: "/bin/zsh"
                });

                return {
                    stdout: stdout.slice(0, 12000),
                    stderr: stderr.slice(0, 12000)
                };
            }
        }
    ];
}

function resolveWorkspacePath(rootDir, targetPath) {
    const absolutePath = path.resolve(rootDir, targetPath);
    const relativePath = path.relative(rootDir, absolutePath);

    if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
        throw new Error("Path escapes workspace root.");
    }

    return absolutePath;
}

function normalizeOutputPath(rootDir, absolutePath) {
    const relativePath = path.relative(rootDir, absolutePath);
    return relativePath || ".";
}

function estimateTokenCount(byteLength) {
    return Math.ceil(byteLength / ESTIMATED_BYTES_PER_TOKEN);
}

module.exports = {
    createDefaultTools
};
