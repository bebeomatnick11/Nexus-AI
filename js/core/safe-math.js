/**
 * NEXUSAI V5 — Safe Math Parser & Evaluator
 * Supports Unary Operators & Right-Associative Exponentiation
 */

export class SafeMathEvaluator {
    static evaluate(expr) {
        const sanitized = String(expr).replace(/\s+/g, "");
        if (!sanitized || !/^[0-9+\-*/().%^]+$/.test(sanitized)) {
            throw new Error("Invalid characters in math expression.");
        }

        const tokens = SafeMathEvaluator.tokenize(sanitized);
        return SafeMathEvaluator.parseTokens(tokens);
    }

    static tokenize(expr) {
        const tokens = [];
        let numberBuffer = "";

        for (let i = 0; i < expr.length; i++) {
            const ch = expr[i];

            if ("0123456789.".includes(ch)) {
                numberBuffer += ch;
            } else {
                if (numberBuffer.length > 0) {
                    if ((numberBuffer.match(/\./g) || []).length > 1) {
                        throw new Error(`Malformed decimal number: ${numberBuffer}`);
                    }
                    tokens.push(parseFloat(numberBuffer));
                    numberBuffer = "";
                }

                // Unary minus/plus handling
                if ((ch === "-" || ch === "+") && (tokens.length === 0 || tokens[tokens.length - 1] === "(" || "+-*/%^".includes(tokens[tokens.length - 1]))) {
                    tokens.push(ch === "-" ? "UNARY_MINUS" : "UNARY_PLUS");
                } else {
                    tokens.push(ch);
                }
            }
        }

        if (numberBuffer.length > 0) {
            if ((numberBuffer.match(/\./g) || []).length > 1) {
                throw new Error(`Malformed decimal number: ${numberBuffer}`);
            }
            tokens.push(parseFloat(numberBuffer));
        }

        return tokens;
    }

    static parseTokens(tokens) {
        const values = [];
        const ops = [];

        const precedence = (op) => {
            if (op === "UNARY_MINUS" || op === "UNARY_PLUS") return 4;
            if (op === "^") return 3; // Right-associative
            if (op === "*" || op === "/" || op === "%") return 2;
            if (op === "+" || op === "-") return 1;
            return 0;
        };

        const isRightAssociative = (op) => op === "^" || op === "UNARY_MINUS" || op === "UNARY_PLUS";

        const applyOp = () => {
            const op = ops.pop();
            if (op === "UNARY_MINUS") {
                const val = values.pop();
                if (val === undefined) throw new Error("Invalid unary minus");
                values.push(-val);
                return;
            }
            if (op === "UNARY_PLUS") {
                return; // No-op
            }

            const b = values.pop();
            const a = values.pop();
            if (a === undefined || b === undefined) throw new Error("Malformed math tokens");

            switch (op) {
                case "+": values.push(a + b); break;
                case "-": values.push(a - b); break;
                case "*": values.push(a * b); break;
                case "/": 
                    if (b === 0) throw new Error("Division by zero");
                    values.push(a / b); 
                    break;
                case "%": values.push(a % b); break;
                case "^": values.push(Math.pow(a, b)); break;
            }
        };

        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];

            if (typeof token === "number") {
                values.push(token);
            } else if (token === "(") {
                ops.push(token);
            } else if (token === ")") {
                while (ops.length > 0 && ops[ops.length - 1] !== "(") {
                    applyOp();
                }
                ops.pop(); // Remove '('
            } else {
                while (
                    ops.length > 0 &&
                    ops[ops.length - 1] !== "(" &&
                    (precedence(ops[ops.length - 1]) > precedence(token) ||
                        (precedence(ops[ops.length - 1]) === precedence(token) && !isRightAssociative(token)))
                ) {
                    applyOp();
                }
                ops.push(token);
            }
        }

        while (ops.length > 0) {
            applyOp();
        }

        if (values.length !== 1 || isNaN(values[0])) {
            throw new Error("Failed to evaluate mathematical expression");
        }

        return values[0];
    }
}
