const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout
});

const ask = (query) => new Promise((resolve) => readline.question(query, resolve));

const temperature = 1.0;

async function requestCompletion(prompt) {
    try {
        const response = await fetch("http://localhost:1234/v1/completions", {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'local-model',
                prompt: prompt,
                temperature: temperature,
                max_tokens: 1000,
                stop: ["<turn|>", "<|turn>", "<tool_call|>"]
            })
        });

        if (!response.ok) {
            throw new Error(`Err: ${response.status}`);
        }

        const result = await response.json();
        return result;
    }
    catch (error) {
        console.error(`Err: ${error.message}`);
    }
}

function gemmaStringify(obj) {
    if (typeof obj === 'function') return undefined;
    if (typeof obj === 'string') return `<|"|>${obj}<|"|>`;
    if (typeof obj !== 'object' || obj === null) return String(obj);
    
    // Recursively handle arrays
    if (Array.isArray(obj)) {
        return `[${obj.map(gemmaStringify).filter(i => i !== undefined).join(', ')}]`;
    }
    
    // Recursively handle objects
    const props = Object.entries(obj)
        .map(([key, value]) => {
            const encoded = gemmaStringify(value);
            return encoded !== undefined ? `"${key}": ${encoded}` : null;
        })
        .filter(p => p !== null);
    return `{${props.join(', ')}}`;
}

function stringifyToolDefinitions(definitions) {
    let str = "";
    for (let tool of definitions) {
        str += "<|tool>\n";
        str += gemmaStringify(tool) + "\n";
        str += "<tool|>\n";
    }
    return str;
}

function parseToolCall(generatedText) {
    let raw = generatedText.replace("<|tool_call>", "").replace("<tool_call|>", "").trim();
    const callMatch = raw.match(/call:\s*([a-zA-Z0-9_]+)\s*\{([\s\S]*?)\}/);
    
    if (!callMatch) throw new Error("Unrecognized tool call syntax.");

    const name = callMatch[1].trim();
    const rawArgs = callMatch[2].trim();
    let parameters = {};

    if (rawArgs) {
        // Normalize Gemma tokens and unquoted keys to valid JSON
        let fixedArgs = rawArgs.replace(/<\|"\|>([\s\S]*?)<\|"\|>/g, (_, v) => `"${v.replace(/"/g, '\\"')}"`);
        fixedArgs = fixedArgs.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?\s*:/g, '"$2":');
        parameters = JSON.parse(`{${fixedArgs}}`);
    }

    return { name, parameters };
}

function executeTool(toolCall) {
    const tool = toolDefinitions.find(t => t.name === toolCall.name);
    const result = tool ? tool.resolve(toolCall.parameters) : { error: `Tool ${toolCall.name} not found!` };
    return `<|tool_response|>\n${gemmaStringify(result)}\n<tool_response|>\n`;
}

const toolDefinitions = [
    {
        name: "weather",
        description: "Get the current weather for a location",
        parameters: {
            location: "string"
        },
        resolve: () => "19 degrees and sunny."
    }
];

const systemPrompt = `<|turn>system
You are a helpful assistant. Write concisely. Give answers as prose without formatting.<turn|>
${stringifyToolDefinitions(toolDefinitions)}`;

async function main() {
    console.log(`Agent started. Available commands: 'exit', 'clear'. Temperature: ${temperature}\n`);

    let conversationHistory = systemPrompt;

    while (true) {
        let input = await ask("User: ");

        if (input.toLowerCase() === 'exit') {
            readline.close();
            break;
        }

        if (input.toLowerCase() === 'clear') {
            console.log("Conversation history reset\n");
            conversationHistory = systemPrompt;
            input = await ask("User: ");
        }

        conversationHistory += `<|turn>user\n${input}<turn|>\n<|turn>model\n`;

        let turnComplete = false;

        while (!turnComplete) {
            const answer = await requestCompletion(conversationHistory);
            if (!answer?.choices?.[0]) {
                console.log("Empty response from model.");
                break;
            }

            const generatedText = answer.choices[0].text.trim();

            if (generatedText.includes("<|tool_call>")) {
                try {
                    const toolCall = parseToolCall(generatedText);
                    const resultString = executeTool(toolCall);
                    
                    conversationHistory += `${generatedText}<tool_call|>\n${resultString}`;
                }
                catch (e) {
                    console.log(`\nTool Parse Error: ${e.message}`);
                    conversationHistory += `${generatedText}<tool_call|>\n<|tool_response>{"error": "Invalid syntax."}<tool_response|>\n`;
                }
            }
            else {
                console.log(`Assistant: ${generatedText}\n`);
                conversationHistory += `${generatedText}<turn|>\n`;
                turnComplete = true;
            }
        }
    }
}

main();