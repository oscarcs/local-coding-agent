const STRING_TOKEN = `<|"|>`;

function stripThoughtBlocks(text) {
    return text.replace(/<\|channel>thought[\s\S]*?<channel\|>/g, "");
}

function extractThoughtBlocks(text) {
    const thoughts = [];
    const thoughtPattern = /<\|channel>thought\s*([\s\S]*?)<channel\|>/g;
    let match = thoughtPattern.exec(text);

    while (match) {
        thoughts.push(match[1].trim());
        match = thoughtPattern.exec(text);
    }

    return thoughts.filter(Boolean);
}

function parseToolCallFromText(text) {
    const start = text.indexOf("<|tool_call>");
    if (start === -1) {
        return null;
    }

    const body = text.slice(start + "<|tool_call>".length);
    if (!body.startsWith("call:")) {
        throw new Error("Tool call did not start with call:.");
    }

    const scanner = createScanner(body.slice("call:".length));
    const name = parseIdentifier(scanner);
    const args = parseValue(scanner);

    skipWhitespace(scanner);
    let end = start + "<|tool_call>".length + "call:".length + scanner.index;

    if (text.startsWith("<tool_call|>", end)) {
        end += "<tool_call|>".length;
    }

    return {
        start,
        end,
        name,
        arguments: args && typeof args === "object" && !Array.isArray(args) ? args : {}
    };
}

function createScanner(text) {
    return { text, index: 0 };
}

function parseValue(scanner) {
    skipWhitespace(scanner);

    if (peekStringToken(scanner)) {
        return parseGemmaString(scanner);
    }

    const char = scanner.text[scanner.index];

    if (char === "{") {
        return parseObject(scanner);
    }

    if (char === "[") {
        return parseArray(scanner);
    }

    if (char === "-" || isDigit(char)) {
        return parseNumber(scanner);
    }

    const literal = parseIdentifier(scanner);
    if (literal === "true") return true;
    if (literal === "false") return false;
    if (literal === "null") return null;
    return literal;
}

function parseObject(scanner) {
    expectChar(scanner, "{");
    const result = {};

    skipWhitespace(scanner);
    if (scanner.text[scanner.index] === "}") {
        scanner.index += 1;
        return result;
    }

    while (scanner.index < scanner.text.length) {
        const key = parseObjectKey(scanner);
        skipWhitespace(scanner);
        expectChar(scanner, ":");
        result[key] = parseValue(scanner);
        skipWhitespace(scanner);

        if (scanner.text[scanner.index] === "}") {
            scanner.index += 1;
            return result;
        }

        expectChar(scanner, ",");
        skipWhitespace(scanner);
    }

    throw new Error("Unterminated object.");
}

function parseArray(scanner) {
    expectChar(scanner, "[");
    const result = [];
    skipWhitespace(scanner);

    if (scanner.text[scanner.index] === "]") {
        scanner.index += 1;
        return result;
    }

    while (scanner.index < scanner.text.length) {
        result.push(parseValue(scanner));
        skipWhitespace(scanner);

        if (scanner.text[scanner.index] === "]") {
            scanner.index += 1;
            return result;
        }

        expectChar(scanner, ",");
        skipWhitespace(scanner);
    }

    throw new Error("Unterminated array.");
}

function parseObjectKey(scanner) {
    skipWhitespace(scanner);

    if (peekStringToken(scanner)) {
        return parseGemmaString(scanner);
    }

    if (scanner.text[scanner.index] === "\"") {
        return parseQuotedString(scanner);
    }

    return parseIdentifier(scanner);
}

function parseGemmaString(scanner) {
    expectToken(scanner, STRING_TOKEN);
    const end = scanner.text.indexOf(STRING_TOKEN, scanner.index);
    if (end === -1) {
        throw new Error("Unterminated Gemma string.");
    }

    const value = scanner.text.slice(scanner.index, end);
    scanner.index = end + STRING_TOKEN.length;
    return value;
}

function parseQuotedString(scanner) {
    expectChar(scanner, "\"");
    let value = "";

    while (scanner.index < scanner.text.length) {
        const char = scanner.text[scanner.index];
        scanner.index += 1;

        if (char === "\"") {
            return value;
        }

        if (char === "\\") {
            if (scanner.index >= scanner.text.length) {
                throw new Error("Invalid escape sequence.");
            }

            value += scanner.text[scanner.index];
            scanner.index += 1;
            continue;
        }

        value += char;
    }

    throw new Error("Unterminated quoted string.");
}

function parseIdentifier(scanner) {
    skipWhitespace(scanner);
    const start = scanner.index;

    while (scanner.index < scanner.text.length) {
        const char = scanner.text[scanner.index];
        if (!/[A-Za-z0-9_\-.]/.test(char)) {
            break;
        }
        scanner.index += 1;
    }

    if (scanner.index === start) {
        throw new Error(`Expected identifier at offset ${scanner.index}.`);
    }

    return scanner.text.slice(start, scanner.index);
}

function parseNumber(scanner) {
    const start = scanner.index;

    if (scanner.text[scanner.index] === "-") {
        scanner.index += 1;
    }

    while (isDigit(scanner.text[scanner.index])) {
        scanner.index += 1;
    }

    if (scanner.text[scanner.index] === ".") {
        scanner.index += 1;
        while (isDigit(scanner.text[scanner.index])) {
            scanner.index += 1;
        }
    }

    const value = Number(scanner.text.slice(start, scanner.index));
    if (Number.isNaN(value)) {
        throw new Error(`Invalid number at offset ${start}.`);
    }

    return value;
}

function skipWhitespace(scanner) {
    while (scanner.index < scanner.text.length && /\s/.test(scanner.text[scanner.index])) {
        scanner.index += 1;
    }
}

function peekStringToken(scanner) {
    return scanner.text.startsWith(STRING_TOKEN, scanner.index);
}

function expectToken(scanner, token) {
    if (!scanner.text.startsWith(token, scanner.index)) {
        throw new Error(`Expected token ${token} at offset ${scanner.index}.`);
    }
    scanner.index += token.length;
}

function expectChar(scanner, char) {
    if (scanner.text[scanner.index] !== char) {
        throw new Error(`Expected '${char}' at offset ${scanner.index}.`);
    }
    scanner.index += 1;
}

function isDigit(char) {
    return char >= "0" && char <= "9";
}

module.exports = {
    extractThoughtBlocks,
    parseToolCallFromText,
    stripThoughtBlocks
};
