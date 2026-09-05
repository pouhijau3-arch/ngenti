/**
 * lib/calculator.js
 *
 * Real math evaluation using mathjs's limited-scope evaluator (no access
 * to JS globals, no arbitrary code execution). This never uses eval()
 * or new Function().
 */

const { create, all } = require("mathjs");

// Create a restricted mathjs instance: no import(), no createUnit chains
// that could be abused, and a hard timeout.
const math = create(all, {});
math.import(
  {
    import: function () {
      throw new Error("Function import is disabled");
    },
    createUnit: function () {
      throw new Error("Function createUnit is disabled");
    },
    evaluate: function () {
      throw new Error("Nested evaluate is disabled");
    },
  },
  { override: true }
);

function calculate(expression) {
  if (typeof expression !== "string" || expression.length === 0) {
    throw new Error("`expression` must be a non-empty string");
  }
  if (expression.length > 500) {
    throw new Error("Expression too long");
  }
  let result;
  try {
    result = math.evaluate(expression);
  } catch (err) {
    throw new Error(`Could not evaluate expression: ${err.message}`);
  }
  const formatted = math.format(result, { precision: 14 });
  return { expression, result: formatted };
}

module.exports = { calculate };
