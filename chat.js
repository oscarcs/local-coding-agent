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
                stop: ["<turn|>", "<|turn>"]
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

const systemPrompt = "<|turn>system\nYou are a helpful assistant. Write concisely. Give answers as prose without formatting.<turn|>\n";

async function main() {
    console.log(`Chat started. Available commands: 'exit', 'clear'. Temperature: ${temperature}\n`);

    // Initialize the history using Gemma's specific formatting
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

        const answer = await requestCompletion(conversationHistory);
        if (answer && answer.choices && answer.choices.length > 0) {
            const reply = answer.choices[0].text.trim();

            console.log("\n");
            console.log(`Assistant: ${reply}\n`);

            conversationHistory += `${reply}<turn|>\n`;
        }
        else {
            console.log("Something went wrong!");
        }
    }
}

main();