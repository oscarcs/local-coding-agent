# local-coding-agent

This repository is a small progression of LLM harnesses built on top of a local completion endpoint.

I built this to try and get a first-principles intuition what LLM-assisted tools are actually doing. At the bottom, everything here is the same basic loop: build a prompt, send it to a model, read the text completion, and decide what to do next. The harnesses differ in how much structure they put around that loop.

`complete.js` is the starting point: a plain completion REPL. It reads one line from the terminal, sends that text directly to `/v1/completions`, and prints whatever the model continues with. There is no conversation state, no system prompt beyond the literal user input, and no tool use. This is the simplest useful harness you can build with LLMs because it exposes the core mechanic with almost no abstraction.

We then upgrade the capabilities in `chat.js`. Instead of treating each prompt as isolated, we keep a running transcript and wrap that transcript in Gemma-style turn markers. That change is conceptually small but important: once the model can see prior turns, the harness stops being a one-shot completer and starts behaving like a chat assistant. The code is still straightforward. The harness itself owns the conversation history, appends the user turn, asks for the next model turn, then stores the reply back into history.

The next step is tool use, which is where we can jump from “chat UI” to “agent harness.” 

`weather.js` is a first simple agent built on the same pattern. It exposes a weather lookup function (using Visual Crossing; you'll need a free API key) backed by an HTTP request. The harness watches for a special tool-call pattern in the model output. When the model emits one of those calls, the harness parses it, runs a local function, injects the tool result back into the prompt, and then lets the model continue.

That is the core agent pattern: the model does not act directly on the world, it proposes an action in text, and the harness decides whether and how to execute it. `assistant.js` is a second simple agent that includes file and directory reading capabilities that would be needed for a programming agent.

The final step is `programmer.js`, which is a working programming agent with an actual architecture rather than a one-file script. At a high level, the agent works like this: `src/gemma-format.js` renders a structured conversation with system instructions, tool declarations, prior turns, and the next user message. `src/llm.js` sends that prompt to the local completion endpoint. `src/gemma-parse.js` extracts thought blocks and parses tool calls out of the returned text. `src/agent.js` then runs the main control loop: ask the model for the next step, emit any internal thought text for debugging, execute a tool if the model requested one, append the tool response back into the prompt, and keep looping until the model finally produces a user-facing answer. `src/tools.js` defines the programming tools themselves, including workspace-scoped file reads and writes, exact replacement, directory listing, and shell command execution. We can then drop some TUI and debugging tools on top of this to make it usuable.

With many thanks to Thorsten Ball of Amp Code who inspired this with his [excellent blogpost](https://ampcode.com/notes/how-to-build-an-agent).

## Running

These scripts expect a local completion endpoint at `http://localhost:1234/v1/completions` with a model available as `local-model`. LM Studio can provide this. A Gemma 4 model is required - `gemma-4-E4B` is capable enough for actual simple programming tasks and runs in well under 10GB of RAM at good speed on my 24GB M5 Pro Macbook Pro.

Run the final programming agent with:

```bash
npm start -- --dir .
```

Run the debug REPL for the same agent with:

```bash
npm run debug -- --dir .
```

The earlier harnesses can be launched directly with Node, for example:

```bash
node complete.js
node chat.js
node assistant.js
node weather.js
```
