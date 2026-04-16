async function requestCompletion({
    endpoint,
    model,
    prompt,
    temperature,
    maxTokens
}) {
    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model,
            prompt,
            temperature,
            max_tokens: maxTokens,
            stop: ["<turn|>", "<|turn>", "<|tool_response>"]
        })
    });

    if (!response.ok) {
        const body = await response.text();
        throw new Error(`LLM request failed with ${response.status}: ${body}`);
    }

    const result = await response.json();
    const text = result?.choices?.[0]?.text;

    if (typeof text !== "string") {
        throw new Error("LLM response did not include completion text.");
    }

    return text;
}

module.exports = {
    requestCompletion
};
