<?php

declare(strict_types=1);

/**
 * Security coverage test: the audit, made repeatable.
 *
 * The plugin was audited by hand and came out clean. This file exists so that the
 * next handler, route or renderer does not have to be audited by hand too: an
 * unprotected wp_ajax handler, a route without permission_callback, or a piece of
 * server data reaching .html() unescaped fails this test, and therefore the build.
 *
 * It needs neither WordPress nor a database, because it reads the shipped source
 * as text. A security test that needs a running store is a security test nobody
 * runs. It does not replace a review: it can only assert the properties written
 * below, and the limits are stated at the end of this file.
 *
 * The five properties:
 *   1. no wp_ajax_nopriv_ hook, so no handler is reachable while logged out;
 *   2. every wp_ajax handler is in an expected list, so a removal is not silent,
 *      and it guards itself before doing any work, directly or through a guard
 *      method of the same class;
 *   3. every REST route carries a permission_callback, and none is open to anyone;
 *   4. the shipped JavaScript never assigns to innerHTML;
 *   5. every JavaScript concatenation that produces markup escapes its dynamic
 *      operands, or passes a number, or a constant chosen from literals in the
 *      source, or the output of another function defined in the same file, which
 *      this same check holds to the same rule.
 */

/**
 * The handlers the plugin registers, hardcoded. A test that reads the list out of
 * the source agrees with whatever the source contains, including a source that
 * quietly stopped registering a handler.
 */
const MGWS_SEC_AJAX_ACTIONS = array(
    'mgws_get_accept_tree',
    'mgws_commit_accept',
    'mgws_get_product_stock',
    'mgws_apply_inventory_op',
    'mgws_get_warehouses_for_site',
    'mgws_get_location_suggestions',
    'mgws_create_site',
    'mgws_create_warehouse',
    'mgws_add_location_value',
    'mgws_delete_location_value',
    'mgws_link_warehouse_location',
    'mgws_unlink_warehouse_location',
    'mgws_admin_get_tree',
    'mgws_delete_site',
    'mgws_delete_warehouse',
);

/**
 * Guards that protect an ajax handler. The first three are global WordPress
 * functions and are called without a receiver; the rest are methods of the plugin
 * class that a handler may delegate to.
 */
const MGWS_SEC_GUARDS = array(
    'wp_verify_nonce',
    'check_ajax_referer',
    'current_user_can',
    'require_admin_nonce',
    'require_ajax_nonce_any',
    'require_admin_delete_caps',
    'can_manage_master_data',
    'can_read_stock_ajax',
    'can_move_stock_ajax',
    'can_accept_orders_ajax',
);

/**
 * JavaScript functions whose return value is safe to embed in markup.
 * esc() escapes; the wp.i18n.* calls return a string out of the plugin's own
 * catalogue, which is as trusted as the source that produced it.
 */
const MGWS_SEC_TRUSTED_JS_CALLS = array(
    'esc',
    'wp.i18n.__',
    'wp.i18n._x',
    'wp.i18n._n',
    'wp.i18n.sprintf',
    'wp.i18n.translate',
);

/**
 * Callback methods that pass a numeric index, mapped to its parameter position.
 *
 * Array methods hand over the element first and the index second. jQuery's each()
 * does the opposite, and getting that backwards either hides a real operand or
 * excuses a real one.
 */
const MGWS_SEC_JS_ITERATORS = array(
    'forEach' => 1, 'map' => 1, 'filter' => 1, 'some' => 1, 'every' => 1,
    'find' => 1, 'flatMap' => 1, 'findIndex' => 1, 'sort' => 1,
    'each' => 0,
);

/**
 * JavaScript operators, longest first so that greedy matching takes '===' over
 * '=='.
 *
 * Reading punctuation one character at a time was the single worst defect in this
 * scanner: '===' became three '=' tokens, so `totalsRequired === 0` was read as an
 * assignment to totalsRequired with the value '= = 0', and every use of the
 * variable after that line lost its provenance. '||' split the same way, so
 * parseInt(...) || 0 did not read as a number.
 */
const MGWS_SEC_JS_OPERATORS = array(
    '>>>=', '...', '===', '!==', '**=', '<<=', '>>=', '>>>', '&&=', '||=', '??=',
    '=>', '==', '!=', '<=', '>=', '&&', '||', '??', '?.', '++', '--', '+=', '-=',
    '*=', '/=', '%=', '&=', '|=', '^=', '**', '<<', '>>',
);

const MGWS_SEC_PLUGIN_FILE = '/includes/class-mgws-plugin.php';
const MGWS_SEC_REST_FILE   = '/includes/class-mgws-rest-api.php';

function mgws_sec_root(): string
{
    return dirname(__DIR__);
}

/**
 * Reads a shipped file.
 *
 * Joins with exactly one separator, so 'assets/x.js' and '/assets/x.js' both
 * resolve. One caller used each form, and a plain concatenation of the two
 * silently produced mg-warehouse-stockassets/x.js: a path that does not exist,
 * reported as an error naming something nobody wrote.
 */
function mgws_sec_read(string $relative): string
{
    $path = rtrim(mgws_sec_root(), '/') . '/' . ltrim($relative, '/');
    $text = @file_get_contents($path);
    if ($text === false) {
        throw new RuntimeException('cannot read ' . $path);
    }

    return $text;
}

/** 1-based line number of a byte offset. */
function mgws_sec_line(string $source, int $offset): int
{
    return substr_count($source, "\n", 0, $offset) + 1;
}

/** Every shipped JavaScript file, in a stable order. */
function mgws_sec_js_files(): array
{
    $files = glob(rtrim(mgws_sec_root(), '/') . '/assets/*.js') ?: array();
    sort($files);

    return array_map(
        static function (string $path): string {
            return 'assets/' . basename($path);
        },
        $files
    );
}

/**
 * The text between the bracket opening at $open and its match.
 *
 * Counted on the raw text, so a bracket inside a string literal would corrupt
 * the result. That does not happen in the two shapes parsed here, a method body
 * and a call argument list, and every caller asserts on the content afterwards,
 * so a bad match shows up as a failed expectation rather than a silent pass.
 */
function mgws_sec_balanced(string $text, int $open, string $left, string $right): string
{
    $depth = 0;
    for ($i = $open, $n = strlen($text); $i < $n; $i++) {
        if ($text[$i] === $left) {
            $depth++;
        } elseif ($text[$i] === $right) {
            $depth--;
            if ($depth === 0) {
                return substr($text, $open + 1, $i - $open - 1);
            }
        }
    }

    throw new RuntimeException('unbalanced ' . $left . ' at offset ' . $open);
}

/** Maps every method name in $text to its body. */
function mgws_sec_php_methods(string $text): array
{
    $methods = array();
    $pattern = '/\n\s+(?:(?:public|private|protected|static)\s+)*function\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/';

    if (preg_match_all($pattern, $text, $matches, PREG_OFFSET_CAPTURE) === false) {
        throw new RuntimeException('cannot scan the methods');
    }

    foreach ($matches[1] as $index => $match) {
        $open = strpos($text, '{', $matches[0][$index][1]);
        if ($open === false) {
            continue;
        }
        $methods[$match[0]] = mgws_sec_balanced($text, $open, '{', '}');
    }

    return $methods;
}

/**
 * The comma-separated arguments of a call, at nesting depth zero.
 *
 * Needed to tell an inline endpoint definition from one that is passed in as a
 * variable. The two need different rules, and conflating them leaves a hole:
 * a route that lost its permission_callback was excused because a sibling route
 * in the same method still had one.
 */
function mgws_sec_top_level_args(string $arguments): array
{
    $parts = array();
    $current = '';
    $depth = 0;
    $quote = null;
    $length = strlen($arguments);

    for ($i = 0; $i < $length; $i++) {
        $char = $arguments[$i];

        if ($quote !== null) {
            $current .= $char;
            if ($char === '\\\\' && $i + 1 < $length) {
                $current .= $arguments[++$i];
                continue;
            }
            if ($char === $quote) {
                $quote = null;
            }
            continue;
        }
        if ($char === "'" || $char === '"') {
            $quote = $char;
            $current .= $char;
            continue;
        }
        if ($char === '(' || $char === '[' || $char === '{') {
            $depth++;
        } elseif ($char === ')' || $char === ']' || $char === '}') {
            $depth--;
        }
        if ($char === ',' && $depth === 0) {
            $parts[] = trim($current);
            $current = '';
            continue;
        }
        $current .= $char;
    }
    $parts[] = trim($current);

    return $parts;
}

/**
 * The body of the method enclosing $offset, or null when $offset sits outside
 * every method.
 *
 * Needed because 38 routes are registered with a literal argument array and one
 * is registered from a loop: register_rest_route('mgws/v1', $route, $definitions)
 * passes a variable, so the permission_callback that actually protects it lives
 * in the body that assembles $definitions, not in the call.
 */
function mgws_sec_enclosing_method(string $text, int $offset): ?string
{
    $pattern = '/\n\s+(?:(?:public|private|protected|static)\s+)*function\s+[a-zA-Z_][a-zA-Z0-9_]*\s*\(/';

    if (preg_match_all($pattern, $text, $matches, PREG_OFFSET_CAPTURE) === false) {
        return null;
    }

    $body = null;
    foreach ($matches[0] as $declaration) {
        if ($declaration[1] >= $offset) {
            break;
        }
        $open = strpos($text, '{', $declaration[1]);
        if ($open === false) {
            continue;
        }
        $depth = 0;
        for ($i = $open, $n = strlen($text); $i < $n; $i++) {
            if ($text[$i] === '{') {
                $depth++;
            } elseif ($text[$i] === '}') {
                $depth--;
                if ($depth === 0) {
                    if ($offset < $i) {
                        $body = substr($text, $open + 1, $i - $open - 1);
                    }
                    break;
                }
            }
        }
    }

    return $body;
}

/**
 * The first statement of a PHP body, as text.
 *
 * "First" means before the first ';', or, for an 'if (...) { ... }' opener, the
 * condition itself, which is where a guard lives. A check that merely asks "is
 * wp_verify_nonce called somewhere in here" passes a handler that verifies the
 * nonce after it has already moved stock, which is the failure that matters.
 */
function mgws_sec_first_statement(string $body): string
{
    $length = strlen($body);
    $inString = null;

    for ($i = 0; $i < $length; $i++) {
        $char = $body[$i];

        if ($inString !== null) {
            if ($char === '\\') {
                $i++;
            } elseif ($char === $inString) {
                $inString = null;
            }
            continue;
        }
        if ($char === "'" || $char === '"') {
            $inString = $char;
            continue;
        }
        if ($char === '/' && ($body[$i + 1] ?? '') === '/') {
            $newline = strpos($body, "\n", $i);
            if ($newline === false) {
                break;
            }
            $i = $newline;
            continue;
        }
        if ($char === '/' && ($body[$i + 1] ?? '') === '*') {
            $end = strpos($body, '*/', $i);
            if ($end === false) {
                break;
            }
            $i = $end + 1;
            continue;
        }
        if ($char === ';') {
            return substr($body, 0, $i);
        }
    }

    return $body;
}

/** True when $body's first statement performs a guard, with or without a receiver. */
function mgws_sec_guards_first(string $body): bool
{
    $head = mgws_sec_first_statement($body);

    foreach (MGWS_SEC_GUARDS as $guard) {
        if (preg_match('/(?:->|::|\b)' . preg_quote($guard, '/') . '\s*\(/', $head) === 1) {
            return true;
        }
    }

    return false;
}

// ---------------------------------------------------------------- javascript

/**
 * A small JavaScript scanner.
 *
 * It knows about regex literals, and that is not optional: the first thing esc()
 * does is .replace(/"/g, ...), and a scanner that reads that quote as the start
 * of a string desynchronises and then reports a 240 line file as 11 lines long.
 * A / opens a regex when the previous significant token cannot end an expression,
 * which is the usual JavaScript disambiguation.
 *
 * Tokens are array(kind, text, line), kind being str, regex, num, word or punct.
 */
function mgws_sec_js_scan(string $source): array
{
    $tokens = array();
    $endsExpression = array('str' => true, 'regex' => true, 'num' => true, 'word' => true);
    $length = strlen($source);
    $line = 1;
    $i = 0;

    $previousEndsExpression = static function () use (&$tokens, $endsExpression): bool {
        for ($k = count($tokens) - 1; $k >= 0; $k--) {
            $kind = $tokens[$k][0];
            if (isset($endsExpression[$kind])) {
                return true;
            }
            if ($kind === 'punct') {
                return in_array($tokens[$k][1], array(')', ']', '}', '++', '--'), true);
            }
        }

        return false;
    };

    while ($i < $length) {
        $char = $source[$i];

        if ($char === "\n") {
            $line++;
            $i++;
            continue;
        }
        if ($char === ' ' || $char === "\t" || $char === "\r") {
            $i++;
            continue;
        }
        if (substr($source, $i, 2) === '//') {
            $newline = strpos($source, "\n", $i);
            $i = $newline === false ? $length : $newline;
            continue;
        }
        if (substr($source, $i, 2) === '/*') {
            $end = strpos($source, '*/', $i);
            if ($end === false) {
                break;
            }
            $line += substr_count($source, "\n", $i, $end);
            $i = $end + 2;
            continue;
        }
        if ($char === '"' || $char === "'" || $char === '`') {
            $j = $i + 1;
            while ($j < $length && $source[$j] !== $char) {
                if ($source[$j] === '\\') {
                    $j++;
                } elseif ($source[$j] === "\n") {
                    $line++;
                }
                $j++;
            }
            $tokens[] = array('str', substr($source, $i, min($j + 1, $length) - $i), $line);
            $i = $j + 1;
            continue;
        }
        if ($char === '/' && !$previousEndsExpression()) {
            $j = $i + 1;
            $inClass = false;
            while ($j < $length && $source[$j] !== "\n") {
                if ($source[$j] === '\\') {
                    $j += 2;
                    continue;
                }
                if ($source[$j] === '[') {
                    $inClass = true;
                } elseif ($source[$j] === ']') {
                    $inClass = false;
                } elseif ($source[$j] === '/' && !$inClass) {
                    break;
                }
                $j++;
            }
            $j++;
            while ($j < $length && ctype_alpha($source[$j])) {
                $j++;
            }
            $tokens[] = array('regex', substr($source, $i, $j - $i), $line);
            $i = $j;
            continue;
        }
        if (ctype_digit($char)) {
            $j = $i;
            while ($j < $length && (ctype_alnum($source[$j]) || $source[$j] === '.')) {
                $j++;
            }
            $tokens[] = array('num', substr($source, $i, $j - $i), $line);
            $i = $j;
            continue;
        }
        if (ctype_alpha($char) || $char === '_' || $char === '$') {
            $j = $i;
            while ($j < $length && (ctype_alnum($source[$j]) || $source[$j] === '_' || $source[$j] === '$')) {
                $j++;
            }
            $tokens[] = array('word', substr($source, $i, $j - $i), $line);
            $i = $j;
            continue;
        }

        $operator = null;
        foreach (MGWS_SEC_JS_OPERATORS as $candidate) {
            if (substr($source, $i, strlen($candidate)) === $candidate) {
                $operator = $candidate;
                break;
            }
        }
        if ($operator !== null) {
            $tokens[] = array('punct', $operator, $line);
            $i += strlen($operator);
            continue;
        }

        $tokens[] = array('punct', $char, $line);
        $i++;
    }

    return $tokens;
}

/** Index one past the operand starting at $start, honouring parentheses. */
function mgws_sec_js_operand_end(array $tokens, int $start): int
{
    if (($tokens[$start][0] ?? '') === 'punct' && $tokens[$start][1] === '(') {
        $depth = 0;
        for ($k = $start, $n = count($tokens); $k < $n; $k++) {
            if ($tokens[$k][0] !== 'punct') {
                continue;
            }
            if ($tokens[$k][1] === '(') {
                $depth++;
            } elseif ($tokens[$k][1] === ')') {
                $depth--;
                if ($depth === 0) {
                    return $k + 1;
                }
            }
        }

        return count($tokens);
    }

    return $start + 1;
}

/**
 * Index one past the value starting at $start: a dotted name and, if there is
 * one, its argument list.
 *
 * A member access has to be consumed whole. Truncating it at the first word
 * reduced wp.i18n.__('x') to the single word wp, and every gettext call in the
 * codebase then looked like an unescaped operand: 46 red lines on correct code.
 */
function mgws_sec_js_value_end(array $tokens, int $start): int
{
    $count = count($tokens);
    $kind = $tokens[$start][0] ?? '';
    $text = $tokens[$start][1] ?? '';

    // A literal and a number are one token each. Returning $start here instead of
    // $start + 1 makes the span empty, and the concatenation walk then stops after
    // its first operand: 181 markup sinks counted, 181 operands examined, one
    // each. The check reported nothing because it never looked at the operands.
    if ($kind === 'str' || $kind === 'num' || $kind === 'regex') {
        return $start + 1;
    }
    if ($kind === 'punct' && $text === '(') {
        return mgws_sec_js_operand_end($tokens, $start);
    }
    if ($kind !== 'word') {
        return $start + 1;
    }

    $i = $start;
    while ($i < $count && $tokens[$i][0] === 'word') {
        $i++;
        if ($i + 1 < $count && $tokens[$i][0] === 'punct' && $tokens[$i][1] === '.'
            && $tokens[$i + 1][0] === 'word') {
            $i++;
            continue;
        }
        break;
    }

    if ($i < $count && $tokens[$i][0] === 'punct' && $tokens[$i][1] === '(') {
        return mgws_sec_js_operand_end($tokens, $i);
    }

    return $i;
}

/**
 * The dotted name starting at $start: 'wp', 'wp.i18n', 'wp.i18n.__'.
 *
 * The scanner has no notion of member access, so wp.i18n.__('x') arrives as
 * three words and two dots. Comparing only the first token against the trusted
 * list flagged every gettext call in the codebase: how a check that should be
 * green ends up red on 46 lines of correct code.
 */
function mgws_sec_js_dotted_name(array $tokens, int $start, int $end): string
{
    $name = '';
    $i = $start;

    while ($i < $end && $tokens[$i][0] === 'word') {
        $name .= ($name === '' ? '' : '.') . $tokens[$i][1];
        $i++;
        if ($i + 1 < $end && $tokens[$i][0] === 'punct' && $tokens[$i][1] === '.'
            && $tokens[$i + 1][0] === 'word') {
            $i++;
            continue;
        }
        break;
    }

    return $name;
}

/**
 * Index one past the expression starting at $start, up to a top-level separator.
 *
 * An assigned value is an expression, not an operand: `ok ? 'a' : 'b'` is three
 * tokens and one value. Taking a single operand instead made the constant check
 * see only the condition `ok`, which it cannot account for, and it then flagged
 * a class name that is written out in the source two lines above.
 */
function mgws_sec_js_expr_end(array $tokens, int $start): int
{
    $depth = 0;
    for ($i = $start, $n = count($tokens); $i < $n; $i++) {
        if ($tokens[$i][0] !== 'punct') {
            continue;
        }
        $char = $tokens[$i][1];
        if ($char === '(' || $char === '[' || $char === '{') {
            $depth++;
        } elseif ($char === ')' || $char === ']' || $char === '}') {
            if ($depth === 0) {
                return $i;
            }
            $depth--;
        } elseif ($depth === 0 && in_array($char, array(',', ';'), true)) {
            return $i;
        }
    }

    return count($tokens);
}

/**
 * JavaScript functions that return a number whatever they are given.
 *
 * A call used to be skipped whole, which made every call look numeric:
 * `var x = String($d.attr('class'))` and a hypothetical `var x = fetchLabel()` were
 * both accepted, and the second is exactly the hole this check exists for. Only
 * the coercions and the Math namespace convert.
 */
const MGWS_SEC_JS_NUMERIC_CALLS = array(
    'parseInt', 'parseFloat', 'Number',
);

/** True when a token slice is a number, or is built only out of numbers. */
function mgws_sec_js_numeric(array $slice, array $all, ?array $scope, array &$proved, int $depth = 0): bool
{
    if ($depth > 8) {
        return false;
    }

    $slice = array_values($slice);
    $count = count($slice);
    $i = 0;

    while ($i < $count) {
        $kind = $slice[$i][0];
        $text = $slice[$i][1];

        if ($kind === 'num' || $kind === 'str' || $text === 'true' || $text === 'false'
            || $text === 'null' || $text === 'undefined' || $text === 'NaN') {
            $i++;
            continue;
        }
        if ($kind === 'punct' && in_array(
            $text,
            array('+', '-', '*', '/', '%', '||', '&&', '?', ':', ',', '===', '!==', '==', '!=', '<', '>', '<=', '>='),
            true
        )) {
            $i++;
            continue;
        }
        if ($kind === 'punct' && in_array($text, array('(', ')', ';'), true)) {
            $i++;
            continue;
        }
        if ($kind === 'word') {
            // A call, with or without a receiver: $row.find('x'), Math.max(a, b).
            // Its arguments cannot change whether the value it returns is a
            // number, and skipping it is what lets parseInt($c.find('.q')) || 0
            // be read as a number at all. Only the coercions qualify.
            $j = $i + 1;
            $receiver = $text;
            $callee = $text;
            while ($j + 1 < $count && $slice[$j][0] === 'punct' && $slice[$j][1] === '.'
                && $slice[$j + 1][0] === 'word') {
                $callee = $slice[$j + 1][1];
                $j += 2;
            }
            $isCall = $j < $count && $slice[$j][0] === 'punct' && $slice[$j][1] === '(';
            // The receiver is kept because Math.max is qualified through it: the
            // last word in the chain is 'max', not 'Math'.
            if ($isCall && ($receiver === 'Math' || in_array($callee, MGWS_SEC_JS_NUMERIC_CALLS, true))) {
                $close = $j;
                $open = 0;
                for (; $close < $count; $close++) {
                    if ($slice[$close][0] !== 'punct') {
                        continue;
                    }
                    if ($slice[$close][1] === '(') {
                        $open++;
                    } elseif ($slice[$close][1] === ')') {
                        $open--;
                        if ($open === 0) {
                            break;
                        }
                    }
                }
                $i = min($close + 1, $count);
                continue;
            }
            // The only property of a value that is a number is its length.
            if ($j < $count && $slice[$j][0] === 'punct' && $slice[$j][1] === '.'
                && ($slice[$j + 1][0] ?? '') === 'word' && $slice[$j + 1][1] === 'length') {
                $i = $j + 2;
                continue;
            }
            if ($isCall) {
                return false;
            }
            if (!array_key_exists($text, $proved)) {
                $proved[$text] = mgws_sec_js_provenance($all, $text, $scope, $proved, $depth + 1);
            }
            if ($proved[$text] !== 'numeric') {
                return false;
            }
            $i++;
            continue;
        }
        if ($kind === 'punct' && $text === '.') {
            $next = $slice[$i + 1] ?? null;
            if ($next !== null && $next[0] === 'word' && $next[1] === 'length') {
                $i += 2;
                continue;
            }
            if ($next !== null && $next[0] === 'word'
                && in_array($next[1], array('max', 'min', 'round', 'floor', 'ceil', 'abs'), true)) {
                $i += 2;
                continue;
            }

            return false;
        }

        return false;
    }

    return true;
}

/**
 * True when every leaf that can become a string in $value is a literal written in
 * the source.
 *
 * This is what lets cls be embedded in a class attribute: it is
 * ok ? 'mgws-ok' : 'mgws-err', so its only possible values are two literals. A
 * word in a condition position is ignored, because a condition chooses between
 * the literals rather than becoming one. A word followed by a call, or by a dot,
 * is a value leaf and rejects the expression.
 */
function mgws_sec_js_string_constant(array $value, array &$proved): bool
{
    $conditions = array('?', ':', '&&', '||', '!', '==', '!=', '===', '!==');
    $count = count($value);

    for ($position = 0; $position < $count; $position++) {
        if ($value[$position][0] !== 'word') {
            continue;
        }
        $name = $value[$position][1];
        if (in_array($name, array('true', 'false', 'null', 'undefined'), true)) {
            continue;
        }
        $next = $value[$position + 1] ?? null;
        if ($next !== null && $next[0] === 'punct' && in_array($next[1], $conditions, true)) {
            continue;
        }
        // A value already proved constant may be used to build another one.
        if (($proved[$name] ?? null) === 'constant') {
            continue;
        }

        return false;
    }

    return true;
}

/**
 * What is known about an identifier: 'numeric', 'constant', or null.
 *
 * This is the provenance argument for a bare operand in markup. Not
 * "totalsRequired looks numeric" but "totalsRequired starts at 0 and after that
 * only ever receives parseInt(...) || 0 and arithmetic over other numbers", which
 * is checkable, and which is what makes leaving it unescaped safe.
 *
 * $scope is the body of the function the use sits in, or null at file level. It
 * matters because a name is only a local fact: admin-masterdata.js has a `cls`
 * that is ok ? 'mgws-ok' : 'mgws-err' inside setMsg, and an unrelated `cls` that
 * holds String($d.attr('class')) eight hundred lines away. Reading the whole file
 * let the second one cancel the first, and the class name in the message banner
 * was reported as unescaped.
 */
function mgws_sec_js_provenance(array $all, string $name, ?array $scope, array &$proved, int $depth = 0): ?string
{
    if ($depth > 8) {
        return null;
    }
    if (array_key_exists($name, $proved)) {
        return $proved[$name];
    }
    $proved[$name] = null; // assumed while recursing, so a cycle stops

    $from = $scope === null ? 0 : $scope[0];
    $to = $scope === null ? count($all) : min($scope[1], count($all));

    // A parameter of a forEach-style callback is an index.
    if (mgws_sec_js_is_callback_index($all, $name, $scope)) {
        return $proved[$name] = 'numeric';
    }

    $kinds = array();

    for ($i = $from; $i < $to; $i++) {
        if ($all[$i][0] !== 'word' || $all[$i][1] !== $name) {
            continue;
        }

        $j = $i + 1;
        $end = $to;
        $isAssignment = false;
        while ($j < $to) {
            $kind = $all[$j][0];
            $text = $all[$j][1];
            // Only an assignment operator may follow the name and still bind a
            // value to it. A property read, a call, a comparison, an increment, a
            // comma, a terminator: none of them is an assignment, and reading the
            // '=' inside '===' as one is what used to happen.
            if ($kind === 'punct') {
                if (in_array($text, array('=', '+=', '-=', '*=', '/=', '%='), true)) {
                    $isAssignment = true;
                    $end = min(mgws_sec_js_expr_end($all, $j + 1), $to);
                }
                break;
            }
            $j++;
        }
        if (!$isAssignment) {
            continue;
        }

        $value = array_slice($all, $j + 1, $end - $j - 1);
        if (mgws_sec_js_numeric($value, $all, $scope, $proved, $depth + 1)) {
            $kinds[] = 'numeric';
        } elseif (mgws_sec_js_string_constant($value, $proved)) {
            $kinds[] = 'constant';
        } else {
            $kinds[] = 'data';
        }
        $i = $end - 1;
    }

    if ($kinds === array() || in_array('data', $kinds, true)) {
        return $proved[$name] = null;
    }
    // Every assignment must agree, otherwise nothing is known.
    if (count(array_unique($kinds)) !== 1) {
        return $proved[$name] = null;
    }

    return $proved[$name] = $kinds[0];
}

/** True when $name is a callback parameter of an iterator, at its index position. */
function mgws_sec_js_is_callback_index(array $all, string $name, ?array $scope): bool
{
    $count = count($all);
    $from = $scope === null ? 0 : $scope[0];
    $to = $scope === null ? $count : min($scope[1], $count);

    for ($i = $from; $i < $to; $i++) {
        if ($all[$i][0] !== 'word' || $all[$i][1] !== 'function') {
            continue;
        }
        $j = $i + 1;
        if (($all[$j][0] ?? '') === 'word') {
            $j++;
        }
        if (($all[$j][0] ?? '') !== 'punct' || $all[$j][1] !== '(') {
            continue;
        }
        $end = mgws_sec_js_operand_end($all, $j) - 1;

        $position = 0;
        $at = -1;
        for ($k = $j + 1; $k < $end; $k++) {
            if ($all[$k][0] === 'punct' && $all[$k][1] === ',') {
                $position++;
                continue;
            }
            if ($at < 0 && $all[$k][0] === 'word' && $all[$k][1] === $name) {
                $at = $position;
            }
        }
        if ($at < 0) {
            continue;
        }

        // The caller is the word the parameter list hangs off, looking back past
        // the function's own name if it has one, past the 'function' keyword
        // either way, and past the caller's argument list. Reading only the token
        // immediately before the '(' gives 'function' for an anonymous callback,
        // '(' for $ths.each(function (idx) { and the function's own name for a
        // named one. None of the three is in the iterator table.
        $before = $j - 1;
        if (($all[$before][0] ?? '') === 'word' && $all[$before][1] !== 'function') {
            $before--;
        }
        if (($all[$before][0] ?? '') === 'word' && $all[$before][1] === 'function') {
            $before--;
        }
        if (($all[$before][0] ?? '') === 'punct' && $all[$before][1] === '(') {
            $before--;
        }
        $callee = ($all[$before][0] ?? '') === 'word' ? $all[$before][1] : null;
        if ($callee === null || !isset(MGWS_SEC_JS_ITERATORS[$callee])) {
            continue;
        }
        if ($at === MGWS_SEC_JS_ITERATORS[$callee]) {
            return true;
        }
    }

    return false;
}

/**
 * The token range of every function, as [the 'function' keyword, the closing brace].
 *
 * Provenience is a local fact about a name, so it is looked up in the function the
 * use sits in. One name reused for two unrelated things in a file is not rare, and
 * reading the whole file merges the two.
 *
 * The range starts at the keyword, not at the opening brace, because a parameter
 * list is part of its function: `each(function (idx) { ... idx ... })` declares idx
 * before the brace, and a range that began at the brace could not see the very
 * callback that made it an index.
 */
function mgws_sec_js_function_scopes(array $tokens): array
{
    $scopes = array();
    $count = count($tokens);

    for ($i = 0; $i < $count; $i++) {
        if ($tokens[$i][0] !== 'word' || $tokens[$i][1] !== 'function') {
            continue;
        }
        $j = $i + 1;
        if (($tokens[$j][0] ?? '') === 'word') {
            $j++;
        }
        if (($tokens[$j][0] ?? '') !== 'punct' || $tokens[$j][1] !== '(') {
            continue;
        }
        $brace = mgws_sec_js_operand_end($tokens, $j);
        if (($tokens[$brace][0] ?? '') !== 'punct' || $tokens[$brace][1] !== '{') {
            continue;
        }
        $depth = 0;
        for ($k = $brace; $k < $count; $k++) {
            if ($tokens[$k][0] !== 'punct') {
                continue;
            }
            if ($tokens[$k][1] === '{') {
                $depth++;
            } elseif ($tokens[$k][1] === '}') {
                $depth--;
                if ($depth === 0) {
                    $scopes[] = array($i, $k);
                    break;
                }
            }
        }
    }

    return $scopes;
}

/** The innermost function body containing $offset, or null at file level. */
function mgws_sec_js_scope_at(array $scopes, int $offset): ?array
{
    $best = null;
    foreach ($scopes as $scope) {
        if ($offset > $scope[0] && $offset < $scope[1]
            && ($best === null || $scope[0] > $best[0])) {
            $best = $scope;
        }
    }

    return $best;
}

/**
 * Checks one operand of a markup concatenation.
 *
 * Acceptable, with a reason for each case: a string literal, a number, a call to
 * a trusted function, a call to a function defined in the same file, which this
 * same pass holds to this same rule, or a bare identifier whose every assignment
 * in the enclosing function is a number or a constant chosen from literals in the
 * source.
 */
function mgws_sec_js_operand(array $tokens, array $scopes, int $start, int $end, array $defined): ?string
{
    $inner = array();
    for ($i = $start; $i < $end; $i++) {
        if ($tokens[$i][0] === 'punct' && ($tokens[$i][1] === '(' || $tokens[$i][1] === ')')) {
            continue;
        }
        $inner[] = $tokens[$i];
    }
    if ($inner === array()) {
        return null;
    }
    if ($inner[0][0] === 'str' || $inner[0][0] === 'num') {
        return null;
    }
    if ($inner[0][0] !== 'word') {
        return 'not a value: ' . $inner[0][1];
    }

    if (in_array(mgws_sec_js_dotted_name($tokens, $start, $end), MGWS_SEC_TRUSTED_JS_CALLS, true)) {
        return null;
    }

    $bare = $inner[0][1];
    // A call is recognised from the span itself, not from the token after it:
    // mgws_sec_js_value_end() consumes the argument list, so the "(" is inside the
    // span. A span that opens with "(" is a parenthesised expression, and reading
    // it as a call sent (idx + 1) and (roomAll ? ... : '') down a path no
    // identifier can satisfy.
    $opensWithParen = ($tokens[$start][0] ?? '') === 'punct' && $tokens[$start][1] === '(';
    $last = $tokens[$end - 1] ?? array('', '', 0);
    $isCall = !$opensWithParen && $end - $start > 1
        && $last[0] === 'punct' && $last[1] === ')';

    if ($isCall && isset($defined[$bare])) {
        return null;
    }
    if (!$isCall) {
        $proved = array();
        $scope = mgws_sec_js_scope_at($scopes, $start);
        if (mgws_sec_js_provenance($tokens, $bare, $scope, $proved) !== null) {
            return null;
        }
    }

    $shown = array();
    foreach ($inner as $token) {
        $shown[] = $token[1];
    }

    return 'unescaped operand: ' . implode(' ', $shown);
}

/** Names of the functions declared in a token stream. */
function mgws_sec_js_defined_functions(array $tokens): array
{
    $defined = array();
    for ($i = 0, $n = count($tokens); $i < $n - 1; $i++) {
        if ($tokens[$i][0] === 'word' && $tokens[$i][1] === 'function'
            && $tokens[$i + 1][0] === 'word') {
            $defined[$tokens[$i + 1][1]] = true;
        }
    }

    return $defined;
}

/**
 * Every markup concatenation in one JavaScript file whose operand cannot be
 * accounted for.
 *
 * A concatenation is a markup sink when one of its literals contains a '<'. The
 * ones that are not are selectors, URLs and data-* attribute values: a quoted
 * jQuery selector is not an injection, and flagging it would bury the real ones.
 */
function mgws_sec_js_unescaped(string $label, string $source): array
{
    $tokens = mgws_sec_js_scan($source);
    $defined = mgws_sec_js_defined_functions($tokens);
    $scopes = mgws_sec_js_function_scopes($tokens);
    $problems = array();
    $count = count($tokens);
    $i = 0;

    while ($i < $count) {
        if ($tokens[$i][0] !== 'str') {
            $i++;
            continue;
        }

        $line = $tokens[$i][2];
        $operands = array();
        $pos = $i;
        while (true) {
            $end = mgws_sec_js_value_end($tokens, $pos);
            $operands[] = array($pos, $end);
            $j = $end;
            if ($j < $count && $tokens[$j][0] === 'punct' && $tokens[$j][1] === '+') {
                $pos = $j + 1;
                while ($pos < $count && $tokens[$pos][0] === 'punct' && $tokens[$pos][1] === '+') {
                    $pos++;
                }
                continue;
            }
            break;
        }

        $literals = '';
        foreach ($operands as $span) {
            if ($tokens[$span[0]][0] === 'str') {
                $literals .= $tokens[$span[0]][1];
            }
        }

        if (strpos($literals, '<') !== false) {
            foreach ($operands as $span) {
                $reason = mgws_sec_js_operand($tokens, $scopes, $span[0], $span[1], $defined);
                if ($reason !== null) {
                    $problems[] = $label . ':' . $line . ': ' . $reason;
                }
            }
        }

        $last = $operands[count($operands) - 1][1];
        $i = $last > $i ? $last : $i + 1;
    }

    return $problems;
}

// ---------------------------------------------------------------- the checks

$mgws_sec_tests = array();

$mgws_sec_tests['ajax_hooks_are_not_public'] = static function (): void {
    $source = mgws_sec_read(MGWS_SEC_PLUGIN_FILE);
    if (strpos($source, 'wp_ajax_nopriv_') !== false) {
        throw new RuntimeException('a wp_ajax_nopriv_ hook exists: reachable while logged out');
    }

    fwrite(STDOUT, 'zero wp_ajax_nopriv_' . PHP_EOL);
};

$mgws_sec_tests['ajax_handlers_guard_before_working'] = static function (): void {
    $source = mgws_sec_read(MGWS_SEC_PLUGIN_FILE);
    $pattern = "/add_action\(\s*'wp_ajax_([a-z0-9_]+)'\s*,\s*array\(\s*\\\$this\s*,\s*'([a-z0-9_]+)'\s*\)\s*\)/";

    if (preg_match_all($pattern, $source, $matches, PREG_SET_ORDER) === false) {
        throw new RuntimeException('cannot scan the ajax registrations');
    }

    $registered = array();
    foreach ($matches as $match) {
        $registered[$match[1]] = $match[2];
    }

    $missing = array_diff(MGWS_SEC_AJAX_ACTIONS, array_keys($registered));
    if ($missing !== array()) {
        throw new RuntimeException('no longer registered: ' . implode(', ', $missing));
    }
    $extra = array_diff(array_keys($registered), MGWS_SEC_AJAX_ACTIONS);
    if ($extra !== array()) {
        throw new RuntimeException('registered but not in the expected list: ' . implode(', ', $extra));
    }

    $methods = mgws_sec_php_methods($source);
    $unprotected = array();

    foreach ($registered as $action => $method) {
        if (!isset($methods[$method])) {
            $unprotected[] = $action . ' (no ' . $method . ')';
            continue;
        }
        if (!mgws_sec_guards_first($methods[$method])) {
            $unprotected[] = $action;
        }
    }

    if ($unprotected !== array()) {
        throw new RuntimeException(
            count($unprotected) . '/' . count($registered)
            . ' do not guard before doing any work: ' . implode(', ', $unprotected)
        );
    }

    fwrite(STDOUT, count($registered) . '/' . count($registered) . ' handler protetti' . PHP_EOL);
};

$mgws_sec_tests['rest_routes_have_permission_callback'] = static function (): void {
    $source = mgws_sec_read(MGWS_SEC_REST_FILE);

    $problems = array();
    $delegated = 0;
    $seen = 0;
    $offset = 0;

    while (($open = strpos($source, 'register_rest_route', $offset)) !== false) {
        $paren = strpos($source, '(', $open);
        if ($paren === false) {
            break;
        }
        $arguments = mgws_sec_balanced($source, $paren, '(', ')');
        $offset = $paren + 1;
        $seen++;
        $line = mgws_sec_line($source, $open);

        $parts = mgws_sec_top_level_args($arguments);
        $endpoints = $parts[2] ?? '';

        if (preg_match('/^\s*(?:array\s*\(|\[)/', $endpoints) === 1) {
            // The endpoint definition is written out here, so the key has to be in
            // it. Searching the enclosing method instead excuses the route: its
            // siblings still carry the key, and the one that lost it ships open.
            if (preg_match('/[\'"]permission_callback[\'"]\s*=>/', $endpoints) !== 1) {
                $problems[] = $line . ' inline route without permission_callback';
                continue;
            }
            $scope = $endpoints;
        } else {
            // The definition is passed in as a variable, so the key lives in the
            // method that assembles it. Checking only the call site would flag the
            // loop as unprotected forever, and the "fix" would be a
            // permission_callback pasted where nobody reads it.
            $enclosing = mgws_sec_enclosing_method($source, $open);
            if ($enclosing === null) {
                $problems[] = $line . ' built elsewhere, no enclosing method to check';
                continue;
            }
            if (preg_match('/[\'"]permission_callback[\'"]\s*=>/', $enclosing) !== 1) {
                $problems[] = $line . ' built elsewhere without permission_callback';
                continue;
            }
            $scope = $enclosing;
            $delegated++;
        }

        if (preg_match('/[\'\"]permission_callback[\'\"]\s*=>\s*[\'\"]__return_true[\'\"]/', $scope) === 1) {
            $problems[] = $line . ' open to anyone';
        }
    }

    if ($seen === 0) {
        throw new RuntimeException('no route found, the scan is not reading the right file');
    }
    if ($problems !== array()) {
        throw new RuntimeException(implode('; ', $problems));
    }

    fwrite(STDOUT, $seen . '/' . $seen . ' route con permission_callback'
        . ' (' . $delegated . ' registrate in ciclo)' . PHP_EOL);
};

$mgws_sec_tests['hpos_order_admin_screen_is_supported'] = static function (): void {
    $source = mgws_sec_read(MGWS_SEC_PLUGIN_FILE);
    $required = array(
        'CustomOrdersTableController::class' => 'detects the HPOS order controller',
        "wc_get_page_screen_id('shop-order')" => 'registers the metabox on the HPOS order screen',
        "page') === 'wc-orders'" => 'loads the order script on the HPOS edit screen',
        'method_exists($post_or_order, \'get_id\')' => 'renders the metabox when Woo passes a WC_Order object',
    );

    $missing = array();
    foreach ($required as $needle => $reason) {
        if (strpos($source, $needle) === false) {
            $missing[] = $reason;
        }
    }

    if ($missing !== array()) {
        throw new RuntimeException(implode('; ', $missing));
    }

    fwrite(STDOUT, 'HPOS order admin screen supported' . PHP_EOL);
};

$mgws_sec_tests['no_innerhtml'] = static function (): void {
    $hits = array();
    $files = mgws_sec_js_files();

    foreach ($files as $file) {
        $source = mgws_sec_read($file);
        if (preg_match_all('/\binnerHTML\b/', $source, $matches, PREG_OFFSET_CAPTURE) > 0) {
            foreach ($matches[0] as $match) {
                $hits[] = $file . ':' . mgws_sec_line($source, $match[1]);
            }
        }
    }
    if ($hits !== array()) {
        throw new RuntimeException(implode('; ', $hits));
    }

    fwrite(STDOUT, count($files) . ' file javascript, zero innerHTML' . PHP_EOL);
};

/**
 * Every operand of every markup concatenation, accounted for.
 *
 * Scope boundary, stated so it is not rediscovered by experiment: this looks at
 * strings built by joining pieces. A sink that takes a bare identifier without
 * building anything, $el.html(userInput), has no concatenation to inspect and
 * passes here unchecked. Covering that needs the value of an identifier, not the
 * shape of a concatenation, and it is not what this check does.
 */
$mgws_sec_tests['markup_operands_are_escaped'] = static function (): void {
    $files = mgws_sec_js_files();
    $problems = array();

    foreach ($files as $file) {
        foreach (mgws_sec_js_unescaped($file, mgws_sec_read($file)) as $problem) {
            $problems[] = $problem;
        }
    }
    if ($problems !== array()) {
        throw new RuntimeException(
            count($problems) . ' operand(s) reach markup unescaped: ' . implode('; ', $problems)
        );
    }

    fwrite(STDOUT, count($files) . ' file javascript, every markup operand accounted for' . PHP_EOL);
};

// ---------------------------------------------------------------- the runner

$mgws_sec_failures = 0;

foreach ($mgws_sec_tests as $mgws_sec_name => $mgws_sec_test) {
    try {
        $mgws_sec_test();
        fwrite(STDOUT, '[PASS] ' . $mgws_sec_name . PHP_EOL);
    } catch (Throwable $error) {
        $mgws_sec_failures++;
        fwrite(STDERR, '[FAIL] ' . $mgws_sec_name . ': ' . $error->getMessage() . PHP_EOL);
    }
}

fwrite(STDOUT, 'SUMMARY failures=' . $mgws_sec_failures . PHP_EOL);
exit($mgws_sec_failures > 0 ? 1 : 0);
