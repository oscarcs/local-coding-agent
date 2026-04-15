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
                max_tokens: 1000
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

async function printCompletion(prompt) {
    const answer = await requestCompletion(prompt);
    // console.log(answer);
    if (answer.choices) {
        console.log(prompt + answer.choices[0].text);
    }
}

async function main() {
    console.log(`REPL started. Available commands: 'exit'. Temperature: ${temperature}\n`);

    while (true) {
        const input = await ask("> ");

        if (input.toLowerCase() === 'exit') {
            readline.close();
            break;
        }

        console.log("\n");
        await printCompletion(input);
        console.log("\n");
    }
}

main();