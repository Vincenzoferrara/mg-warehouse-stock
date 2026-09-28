<?php
/**
 * Regenerates languages/mg-warehouse-stock.pot from the shipped PHP files.
 *
 * Why this is not `xgettext`: some builds of GNU xgettext silently drop every
 * multi-byte character from a PHP string literal, accents included, and leave a
 * plausible-looking catalogue behind. A translator would then receive "Caffe"
 * for "Caffè" and have no way to notice. PHP's own tokenizer cannot make that
 * mistake, so it does the parsing here.
 *
 * The .pot basename must equal the Text Domain and the plugin slug, because
 * that is how WordPress looks the file up.
 *
 * Regeneration is diff-free when no string changed: POT-Creation-Date is reused
 * from the existing file unless the string table moved. A timestamp that
 * changes on every run turns each regeneration into a review comment about a
 * date nobody cares about.
 *
 * Usage: php bin/make-pot.php
 */

declare(strict_types=1);

const PLUGIN_SLUG = 'mg-warehouse-stock';
const TEXT_DOMAIN = 'mg-warehouse-stock';

/**
 * Gettext functions this plugin uses: name => number of the argument holding
 * the msgid.
 */
const GETTEXT_FUNCTIONS = [
    '__' => [1],
    '_e' => [1],
    'esc_html__' => [1],
    'esc_html_e' => [1],
    'esc_attr__' => [1],
    'esc_attr_e' => [1],
    '_x' => [1],
    '_ex' => [1],
    '_n' => [1],
    '_nx' => [1],
    '_n_noop' => [1],
    '_nx_noop' => [1],
];

/** Functions whose second argument is a disambiguation context. */
const CONTEXT_ARGUMENT = ['_x', '_ex', '_nx', '_nx_noop'];

/** Functions whose second argument is the plural form. */
const PLURAL_ARGUMENT = ['_n', '_nx', '_n_noop', '_nx_noop'];

const WRAP_COLUMN = 77;

function fail(string $message): never
{
    fwrite(STDERR, "make-pot: {$message}\n");
    exit(1);
}

/**
 * Turns a PHP string literal token into the string PHP will produce at
 * runtime, or null when the literal interpolates and therefore has no static
 * value.
 */
function literal_value(string $token): ?string
{
    $quote = $token[0];
    $body = substr($token, 1, -1);

    if ($quote === "'") {
        // Single quotes only understand \\ and \'. Everything else is literal,
        // which is why PHP source can hold a stray backslash here.
        return strtr($body, ["\\\\" => '\\', "\\'" => "'"]);
    }

    $out = '';
    $length = strlen($body);

    for ($i = 0; $i < $length; $i++) {
        $char = $body[$i];

        if ($char === '$' || $char === '{') {
            // Interpolated variable or {$...} block. No static msgid exists.
            return null;
        }

        if ($char !== '\\') {
            $out .= $char;
            continue;
        }

        $next = $body[++$i] ?? '';
        $simple = [
            'n' => "\n",
            't' => "\t",
            'r' => "\r",
            'v' => "\v",
            'e' => "\x1b",
            'f' => "\f",
            '\\' => '\\',
            '$' => '$',
            '"' => '"',
        ];

        if (isset($simple[$next])) {
            $out .= $simple[$next];
            continue;
        }

        if ($next === 'x' && preg_match('/^[0-9A-Fa-f]{1,2}/', substr($body, $i + 1), $hex)) {
            $out .= chr((int) hexdec($hex[0]));
            $i += strlen($hex[0]);
            continue;
        }

        if ($next === 'u' && preg_match('/^\{[0-9A-Fa-f]+\}/', substr($body, $i + 1), $unicode)) {
            $out .= mb_chr((int) hexdec(trim($unicode[0], '{}')), 'UTF-8');
            $i += strlen($unicode[0]);
            continue;
        }

        // An unknown escape is kept as written: PHP leaves it alone too.
        $out .= '\\' . $next;
    }

    return $out;
}

/**
 * Escapes a string for a .pot double-quoted literal, and wraps it the way gettext
 * does so the file stays readable in a diff.
 */
function pot_literal(string $value, string $keyword = 'msgid'): string
{
    $escaped = strtr($value, [
        '\\' => '\\\\',
        '"' => '\\"',
        "\t" => '\\t',
        "\r" => '\\r',
    ]);
    $escaped = str_replace("\n", '\\n', $escaped);

    // A literal NUL cannot survive a round trip through a .po file.
    if (str_contains($escaped, "\0")) {
        fail("a translatable string contains a NUL byte: {$value}");
    }

    $single = $keyword . ' "' . $escaped . '"';
    if (strlen($single) <= WRAP_COLUMN) {
        return $single;
    }

    return wrap_pot_literal($keyword, $escaped);
}

/**
 * Wraps a long escaped literal onto continuation lines, never splitting an
 * escape sequence or a multi-byte character.
 */
function wrap_pot_literal(string $keyword, string $escaped): string
{
    // Each atom is either a backslash escape or one whole UTF-8 character, so
    // a chunk boundary can never land inside either of them.
    $atoms = preg_split('/\\\\.|./us', $escaped, -1, PREG_SPLIT_NO_EMPTY);
    if ($atoms === false || $atoms === []) {
        return $keyword . ' "' . $escaped . '"';
    }

    $lines = [];
    $current = '';

    foreach ($atoms as $atom) {
        // Continuation lines carry four extra characters: 4 spaces and 2 quotes.
        $budget = $current === '' ? WRAP_COLUMN - 6 : WRAP_COLUMN - 6;
        if (strlen($current) > 0 && strlen($current) + strlen($atom) > $budget) {
            $lines[] = $current;
            $current = '';
        }
        if (strlen($atom) > $budget) {
            // A single atom longer than a line. Emitting it on its own line
            // still produces a valid file.
            $lines[] = $current === '' ? $atom : $current . $atom;
            $current = '';
            continue;
        }
        $current .= $atom;
    }

    if ($current !== '') {
        $lines[] = $current;
    }

    $out = $keyword . ' ""';
    foreach ($lines as $index => $line) {
        $out .= "\n" . ($index === 0 ? '' : '    ') . '"' . $line . '"';
    }

    return $out;
}

/**
 * Collects the literal arguments of every gettext call in one file.
 *
 * @return array{entries: list<array<string, mixed>>, dynamic: list<string>}
 */
function extract_from_file(string $path): array
{
    $code = file_get_contents($path);
    if ($code === false) {
        fail("cannot read {$path}");
    }

    $tokens = token_get_all($code);
    $entries = [];
    $dynamic = [];
    $count = count($tokens);

    for ($i = 0; $i < $count; $i++) {
        $token = $tokens[$i];
        if (!is_array($token) || $token[0] !== T_STRING) {
            continue;
        }

        $name = $token[1];
        if (!isset(GETTEXT_FUNCTIONS[$name])) {
            continue;
        }

        // The next meaningful token has to be the opening parenthesis, so that
        // a variable or a class member called __ is not mistaken for the
        // function.
        $j = $i + 1;
        while ($j < $count && is_array($tokens[$j]) && $tokens[$j][0] === T_WHITESPACE) {
            $j++;
        }
        if ($j >= $count || $tokens[$j] !== '(') {
            continue;
        }

        $arguments = read_arguments($tokens, $j, $path, $token[2], $name);

        $msgid = $arguments[0] ?? null;
        $second = $arguments[1] ?? null;
        $wantsContext = in_array($name, CONTEXT_ARGUMENT, true);
        $wantsPlural = in_array($name, PLURAL_ARGUMENT, true);

        if ($msgid === null) {
            $dynamic[] = sprintf('%s:%d %s() has no literal msgid', $path, $token[2], $name);
            continue;
        }
        if ($wantsContext && $second === null) {
            $dynamic[] = sprintf('%s:%d %s() has no literal context', $path, $token[2], $name);
            continue;
        }
        if ($wantsPlural && $second === null) {
            $dynamic[] = sprintf('%s:%d %s() has no literal plural form', $path, $token[2], $name);
            continue;
        }

        $entries[] = [
            'msgid' => $msgid,
            'context' => $wantsContext ? $second : null,
            'plural' => $wantsPlural ? $second : null,
            'line' => $token[2],
            'path' => $path,
        ];
    }

    return ['entries' => $entries, 'dynamic' => $dynamic];
}

/**
 * Splits a call's argument list starting at its opening parenthesis.
 *
 * Each entry is the string the argument evaluates to, or null when it is built
 * at runtime: a variable, a concatenation, an interpolated double-quoted
 * string, a nested call. Those cannot be translated, and the caller refuses to
 * write a catalogue that silently omits them.
 *
 * @return list<?string>
 */
function read_arguments(array $tokens, int $open, string $path, int $line, string $function): array
{
    $count = count($tokens);
    $depth = 0;
    $arguments = [];
    $literal = null;
    $dynamic = false;

    for ($i = $open; $i < $count; $i++) {
        $token = $tokens[$i];

        if (is_array($token)) {
            if ($token[0] === T_WHITESPACE || $token[0] === T_COMMENT) {
                continue;
            }
            if ($depth > 1) {
                $dynamic = true;
                continue;
            }
            if (!$dynamic && $literal === null && $token[0] === T_CONSTANT_ENCAPSED_STRING) {
                $value = literal_value($token[1]);
                if ($value === null) {
                    $dynamic = true;
                } else {
                    $literal = $value;
                }
                continue;
            }
            // Anything else at the top level: another literal, a variable, a
            // concatenation operator.
            $dynamic = true;
            continue;
        }

        if ($token === '(' || $token === '[') {
            $depth++;
            if ($depth > 1) {
                $dynamic = true;
            }
            continue;
        }

        if ($token === ')' || $token === ']') {
            $depth--;
            if ($depth === 0) {
                $arguments[] = $dynamic ? null : ($literal ?? '');
                return $arguments;
            }
            continue;
        }

        if ($token === ',' && $depth === 1) {
            $arguments[] = $dynamic ? null : ($literal ?? '');
            $literal = null;
            $dynamic = false;
            continue;
        }

        if ($depth === 1) {
            $dynamic = true;
        }
    }

    fail("unbalanced parentheses in the {$function}() call at {$path}:{$line}");
}

/**
 * Every shipped PHP file, relative to the plugin root.
 *
 * Tests are not shipped, so their strings are not translatable either. The scan
 * walks the tree rather than asking git, so the script runs in CI, in a
 * container without git, and in a plain unpacked zip.
 */
function shipped_php_files(string $rootDir): array
{
    $skip = ['tests', 'node_modules', 'vendor', '.git', 'bin', 'languages'];
    $found = [];

    $iterator = new RecursiveIteratorIterator(
        new RecursiveCallbackFilterIterator(
            new RecursiveDirectoryIterator($rootDir, FilesystemIterator::SKIP_DOTS),
            static function (SplFileInfo $info) use ($skip): bool {
                if ($info->isDir()) {
                    return !in_array($info->getFilename(), $skip, true);
                }
                return strtolower($info->getExtension()) === 'php';
            },
        ),
    );

    /** @var SplFileInfo $file */
    foreach ($iterator as $file) {
        $relative = ltrim(substr($file->getPathname(), strlen($rootDir)), '/');
        $found[] = $relative;
    }

    sort($found);

    return $found;
}

// ---------------------------------------------------------------------------

$rootDir = dirname(__DIR__);
$bootstrap = $rootDir . '/' . PLUGIN_SLUG . '.php';
if (!is_file($bootstrap)) {
    fail("cannot find {$bootstrap}");
}

$version = null;
if (preg_match("/define\(\s*'MGWS_PLUGIN_VERSION'\s*,\s*'([^']+)'/", file_get_contents($bootstrap), $m)) {
    $version = $m[1];
}
if ($version === null) {
    fail('could not read MGWS_PLUGIN_VERSION from the bootstrap');
}

$sources = shipped_php_files($rootDir);
if ($sources === []) {
    fail('no PHP files to scan');
}

/** @var array<string, array<string, mixed>> $catalogue */
$catalogue = [];
$dynamic = [];

foreach ($sources as $source) {
    $result = extract_from_file($rootDir . '/' . $source);
    $dynamic = array_merge($dynamic, $result['dynamic']);

    foreach ($result['entries'] as $entry) {
        $key = ($entry['context'] ?? '') . "\x04" . $entry['msgid'] . "\x04" . ($entry['plural'] ?? '');

        if (!isset($catalogue[$key])) {
            $catalogue[$key] = [
                'msgid' => $entry['msgid'],
                'context' => $entry['context'],
                'plural' => $entry['plural'],
                'references' => [],
            ];
        }
        $catalogue[$key]['references'][] = $entry['path'] . ':' . $entry['line'];
    }
}

if ($dynamic !== []) {
    fwrite(STDERR, "make-pot: found gettext calls whose text cannot be extracted statically:\n");
    foreach ($dynamic as $note) {
        fwrite(STDERR, "  {$note}\n");
    }
    fwrite(STDERR, "make-pot: a dynamic string cannot be translated and will silently stay English.\n");
    exit(1);
}

// Stable output: sort on the msgid so the file does not shuffle between runs.
uksort($catalogue, static function (string $a, string $b) use ($catalogue): int {
    return strcmp(
        $catalogue[$a]['context'] . "\x04" . $catalogue[$a]['msgid'],
        $catalogue[$b]['context'] . "\x04" . $catalogue[$b]['msgid'],
    );
});

$strings = array_values(array_filter(
    $catalogue,
    static fn(array $entry): bool => $entry['msgid'] !== '',
));

$languageDir = $rootDir . '/languages';
$pot = $languageDir . '/' . PLUGIN_SLUG . '.pot';
$checkOnly = in_array('--check', $argv, true);

$body = render_body($strings);
$headerMarker = '"X-Domain: ' . TEXT_DOMAIN . '\\n"' . "\n\n\n";

if ($checkOnly) {
    // The point of this mode is catching a .pot left stale by a new gettext
    // call, so only the string table matters. A different timestamp is not a
    // finding.
    if (!is_file($pot)) {
        fail("{$pot} does not exist; run: php bin/make-pot.php");
    }

    $existing = (string) file_get_contents($pot);
    $markerAt = strpos($existing, $headerMarker);

    if ($markerAt === false || substr($existing, $markerAt + strlen($headerMarker)) !== $body) {
        fwrite(STDERR, "make-pot: {$pot} is out of date.\n");
        fwrite(STDERR, "make-pot: run: php bin/make-pot.php\n");
        exit(1);
    }

    printf("make-pot: %s is up to date (%d strings)\n", $pot, count($strings));
    exit(0);
}

if (!is_dir($languageDir) && !mkdir($languageDir, 0755, true) && !is_dir($languageDir)) {
    fail("cannot create {$languageDir}");
}

// Reuse the previous timestamp unless the string table actually moved, so that
// regenerating an unchanged catalogue produces no diff at all.
$creationDate = date('Y-m-d H:iO');

if (is_file($pot)) {
    $previous = (string) file_get_contents($pot);
    $markerAt = strpos($previous, $headerMarker);

    if (
        $markerAt !== false
        && preg_match('/^"POT-Creation-Date: (.*)\\\\n"$/m', $previous, $match) === 1
        && substr($previous, $markerAt + strlen($headerMarker)) === $body
    ) {
        $creationDate = $match[1];
    }
}

$header = render_header($version, $creationDate);

if (file_put_contents($pot, $header . $body) === false) {
    fail("cannot write {$pot}");
}

printf(
    "make-pot: %s (%d strings, %d files)\n",
    $pot,
    count($strings),
    count($sources),
);

/**
 * Written by hand rather than taken from xgettext, whose own header is full of
 * placeholders and marks the entry as fuzzy, which makes a translator's tool
 * read an untranslated catalogue.
 */
function render_header(string $version, string $creationDate): string
{
    $fields = [
        'Project-Id-Version' => 'MG Warehouse Stock ' . $version,
        'Report-Msgid-Bugs-To' => 'https://github.com/Vincenzoferrara/mg-warehouse-stock/issues',
        'POT-Creation-Date' => $creationDate,
        'PO-Revision-Date' => 'YEAR-MO-DA HO:MI+ZONE',
        'Last-Translator' => 'FULL NAME <EMAIL@ADDRESS>',
        'Language-Team' => 'LANGUAGE <LL@li.org>',
        'Language' => '',
        'MIME-Version' => '1.0',
        'Content-Type' => 'text/plain; charset=UTF-8',
        'Content-Transfer-Encoding' => '8bit',
        // A template must not claim a plural rule: the correct one differs per
        // target language. msgfmt --check therefore reports this placeholder as
        // an error, which is the expected result for any .pot and not a defect.
        // Plain `msgfmt -o /dev/null` compiles the file.
        'Plural-Forms' => 'nplurals=INTEGER; plural=EXPRESSION;',
        'X-Domain' => TEXT_DOMAIN,
    ];

    $out = "# Translation template for the MG Warehouse Stock plugin.\n";
    $out .= "# Copyright (C) 2026 Vincenzo Ferrara\n";
    $out .= "# This file is distributed under the same license as the plugin.\n";
    $out .= "#\n";
    $out .= "msgid \"\"\n";
    $out .= "msgstr \"\"\n";

    foreach ($fields as $name => $value) {
        $out .= '"' . $name . ': ' . $value . '\\n"' . "\n";
    }

    return $out . "\n\n";
}

function render_body(array $strings): string
{
    $out = '';

    foreach ($strings as $entry) {
        $references = array_values(array_unique($entry['references']));
        sort($references);
        $out .= '#: ' . implode(' ', $references) . "\n";

        if (str_contains($entry['msgid'], '%') || str_contains((string) $entry['plural'], '%')) {
            $out .= "#, php-format\n";
        }

        if ($entry['context'] !== null) {
            $out .= pot_literal($entry['context'], 'msgctxt') . "\n";
        }

        $out .= pot_literal($entry['msgid'], 'msgid') . "\n";

        if ($entry['plural'] !== null) {
            $out .= pot_literal($entry['plural'], 'msgid_plural') . "\n";
            $out .= "msgstr[0] \"\"\n";
            $out .= "msgstr[1] \"\"\n";
        } else {
            $out .= "msgstr \"\"\n";
        }

        $out .= "\n";
    }

    return $out;
}
