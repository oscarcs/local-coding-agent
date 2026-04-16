const readline = require("readline");
const util = require("util");

const ANSI_PATTERN = /\x1b\[[0-9;]*m/g;
const COLORS_ENABLED = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);
const ansi = {
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    dim: "\x1b[2m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    gray: "\x1b[90m"
};

function startTui({ agent, title }) {
    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
    }

    const state = {
        input: "",
        transcript: [
            { tone: "title", text: `${title}` },
            { tone: "plain", text: "" },
            { tone: "meta", text: "Commands: /clear, /quit, Ctrl+C, Ctrl+L" },
            { tone: "plain", text: "" }
        ],
        thoughts: [],
        status: "Idle",
        showThoughts: false
    };

    const redraw = () => render(state);

    const addTranscript = (speaker, text) => {
        const normalized = (text || "").trim() || "[empty]";
        const lines = normalized.split("\n");
        state.transcript.push({
            tone: speaker,
            text: `${speaker}: ${lines[0]}`
        });
        for (let index = 1; index < lines.length; index += 1) {
            state.transcript.push({
                tone: speaker,
                text: `  ${lines[index]}`
            });
        }
        redraw();
    };

    agent.on("status", (status) => {
        state.status = status;
        redraw();
    });

    agent.on("thought", (thought) => {
        state.thoughts.push(thought);
        if (state.thoughts.length > 20) {
            state.thoughts.shift();
        }
        redraw();
    });

    agent.on("tool_call", (toolCall) => {
        addTranscript("tool", `${toolCall.name} ${formatInline(toolCall.arguments)}`);
    });

    agent.on("tool_result", (toolResult) => {
        addTranscript("result", `${toolResult.name} ${formatInline(toolResult.response)}`);
    });

    agent.on("assistant_message", (message) => {
        addTranscript("assistant", message);
    });

    const submitInput = async () => {
        const text = state.input.trim();
        if (!text || agent.isBusy) {
            return;
        }

        if (text === "/quit") {
            teardown();
            process.exit(0);
        }

        if (text === "/clear") {
            agent.clearHistory();
            state.transcript = [
                { tone: "title", text: `${title}` },
                { tone: "plain", text: "" },
                { tone: "meta", text: "Conversation cleared." },
                { tone: "plain", text: "" }
            ];
            state.thoughts = [];
            state.input = "";
            redraw();
            return;
        }

        state.input = "";
        state.thoughts = [];
        addTranscript("user", text);

        try {
            await agent.submitUserMessage(text);
        } catch (error) {
            addTranscript("error", error.message);
            state.status = "Idle";
            redraw();
        }
    };

    process.stdin.on("keypress", async (str, key) => {
        if (key.ctrl && key.name === "c") {
            teardown();
            process.exit(0);
        }

        if (key.ctrl && key.name === "l") {
            state.transcript = [
                { tone: "title", text: `${title}` },
                { tone: "plain", text: "" },
                { tone: "meta", text: "Screen cleared." },
                { tone: "plain", text: "" }
            ];
            redraw();
            return;
        }

        if (key.name === "tab") {
            state.showThoughts = !state.showThoughts;
            redraw();
            return;
        }

        if (key.name === "return") {
            await submitInput();
            return;
        }

        if (key.name === "backspace") {
            state.input = state.input.slice(0, -1);
            redraw();
            return;
        }

        if (!key.ctrl && !key.meta && str) {
            state.input += str;
            redraw();
        }
    });

    redraw();
}

function render(state) {
    const columns = process.stdout.columns || 100;
    const rows = process.stdout.rows || 30;
    const transcriptHeight = Math.max(8, rows - 6);

    const transcriptLines = wrapEntries(state.transcript, columns).slice(-transcriptHeight);
    const thoughtLines = state.showThoughts
        ? wrapEntries([
            { tone: "plain", text: "" },
            { tone: "thoughtHeader", text: "Thoughts:" },
            ...state.thoughts.map((thought) => ({ tone: "thought", text: `- ${thought}` }))
        ], columns).slice(-8)
        : [];
    const statusLine = [
        paint("Status:", ansi.bold, ansi.yellow),
        paint(` ${state.status}`, ansi.yellow),
        paint(" | ", ansi.gray),
        paint("Thoughts panel:", ansi.bold, ansi.gray),
        paint(` ${state.showThoughts ? "on" : "off"}`, ansi.gray),
        paint(" (Tab to toggle)", ansi.dim, ansi.gray)
    ].join("");
    const inputLine = `${paint(">", ansi.bold, ansi.cyan)} ${state.input}`;

    const screen = [
        "\u001Bc",
        ...transcriptLines,
        ...thoughtLines,
        "",
        truncate(statusLine, columns),
        truncate(inputLine, columns)
    ].join("\n");

    process.stdout.write(screen);
}

function wrapEntries(entries, width) {
    const output = [];

    for (const entry of entries) {
        const line = entry.text;
        if (!line) {
            output.push("");
            continue;
        }

        let remainder = line;
        while (remainder.length > width) {
            output.push(colorizeLine(entry.tone, remainder.slice(0, width)));
            remainder = remainder.slice(width);
        }
        output.push(colorizeLine(entry.tone, remainder));
    }

    return output;
}

function truncate(value, width) {
    const plain = stripAnsi(value);
    if (plain.length <= width) {
        return value;
    }

    const targetLength = Math.max(0, width - 3);
    let visible = 0;
    let result = "";

    for (let index = 0; index < value.length && visible < targetLength; index += 1) {
        const char = value[index];
        if (char === "\x1b") {
            const match = value.slice(index).match(/^\x1b\[[0-9;]*m/);
            if (match) {
                result += match[0];
                index += match[0].length - 1;
                continue;
            }
        }

        result += char;
        visible += 1;
    }

    return `${result}...${COLORS_ENABLED ? ansi.reset : ""}`;
}

function formatInline(value) {
    return util.inspect(value, {
        depth: 2,
        breakLength: 80,
        maxArrayLength: 20
    });
}

function teardown() {
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
    }
    process.stdout.write("\n");
}

function colorizeLine(tone, text) {
    switch (tone) {
        case "title":
            return paint(text, ansi.bold, ansi.blue);
        case "meta":
            return paint(text, ansi.dim, ansi.gray);
        case "user":
            return colorizeSpeakerLine(text, "user:", [ansi.bold, ansi.cyan]);
        case "assistant":
            return colorizeSpeakerLine(text, "assistant:", [ansi.bold, ansi.green]);
        case "tool":
            return colorizeSpeakerLine(text, "tool:", [ansi.bold, ansi.magenta]);
        case "result":
            return colorizeSpeakerLine(text, "result:", [ansi.bold, ansi.blue]);
        case "error":
            return colorizeSpeakerLine(text, "error:", [ansi.bold, ansi.red]);
        case "thoughtHeader":
            return paint(text, ansi.bold, ansi.gray);
        case "thought":
            return paint(text, ansi.dim, ansi.gray);
        default:
            return text;
    }
}

function colorizeSpeakerLine(text, prefix, styles) {
    if (!text.startsWith(prefix)) {
        return paint(text, ...styles);
    }

    return `${paint(prefix, ...styles)}${text.slice(prefix.length)}`;
}

function paint(text, ...styles) {
    if (!COLORS_ENABLED || !text) {
        return text;
    }

    return `${styles.join("")}${text}${ansi.reset}`;
}

function stripAnsi(value) {
    return value.replace(ANSI_PATTERN, "");
}

module.exports = {
    startTui
};
