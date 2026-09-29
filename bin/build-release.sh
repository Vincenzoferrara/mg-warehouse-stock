#!/usr/bin/env bash
#
# Builds the installable plugin archive.
#
# The repository is the plugin folder, so "building" means picking the files that
# belong in a runtime install out of the ones that only exist for development.
# A single `zip -r .` would ship the tests, the docs and the git history.
#
# The archive root is always mg-warehouse-stock/, because that is the directory
# name WordPress expects after extraction. The slug is invariant: it is wired
# into the text domain, the .pot filename, the local Docker mount and the
# companion app's assumptions.

set -euo pipefail

PLUGIN_SLUG="mg-warehouse-stock"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BOOTSTRAP="$ROOT_DIR/${PLUGIN_SLUG}.php"
DIST_DIR="$ROOT_DIR/dist"
STAGE_DIR="$DIST_DIR/stage/${PLUGIN_SLUG}"

# Directories that make up a runtime install. languages/ carries the translation
# template, which WordPress reads to offer the plugin for translation.
RUNTIME_DIRS=(includes assets languages)
RUNTIME_FILES=(LICENSE readme.txt uninstall.php)

# Nothing on this list may appear in the archive. Checked after staging, not just
# assumed from the copy list, so a future "just add one more thing" cannot leak
# the repository into a store upload.
FORBIDDEN=(.git .github .gitignore bin docs tests dist .write_test OPENCODE.md)

fail() {
    echo "build-release: $1" >&2
    exit 1
}

[ -f "$BOOTSTRAP" ] || fail "cannot find $BOOTSTRAP"

VERSION="$(sed -n "s/^define('MGWS_PLUGIN_VERSION', '\([^']*\)');$/\1/p" "$BOOTSTRAP")"
[ -n "$VERSION" ] || fail "could not read MGWS_PLUGIN_VERSION from $BOOTSTRAP"

# The header version and the readme stable tag are the same promise made twice.
# A mismatch is the kind of thing that only surfaces after the upload.
if [ -f "$ROOT_DIR/readme.txt" ]; then
    STABLE_TAG="$(sed -n 's/^Stable tag:[[:space:]]*//p' "$ROOT_DIR/readme.txt")"
    [ "$STABLE_TAG" = "$VERSION" ] || fail "readme.txt Stable tag is '$STABLE_TAG' but the plugin version is '$VERSION'"
fi

rm -rf "$DIST_DIR"
mkdir -p "$STAGE_DIR"

cp "$BOOTSTRAP" "$STAGE_DIR/"
for dir in "${RUNTIME_DIRS[@]}"; do
    if [ -d "$ROOT_DIR/$dir" ]; then
        cp -R "$ROOT_DIR/$dir" "$STAGE_DIR/"
    fi
done
for file in "${RUNTIME_FILES[@]}"; do
    if [ -f "$ROOT_DIR/$file" ]; then
        cp "$ROOT_DIR/$file" "$STAGE_DIR/"
    fi
done

for path in "${FORBIDDEN[@]}"; do
    if [ -e "$STAGE_DIR/$path" ]; then
        fail "$path reached the staging directory"
    fi
done

ARCHIVE="$DIST_DIR/${PLUGIN_SLUG}-${VERSION}.zip"
(cd "$DIST_DIR/stage" && zip -q -r "../${PLUGIN_SLUG}-${VERSION}.zip" "$PLUGIN_SLUG")

LISTING="$(unzip -Z1 "$ARCHIVE")"

echo "$LISTING" | grep -qx "${PLUGIN_SLUG}/${PLUGIN_SLUG}.php" \
    || fail "the archive has no ${PLUGIN_SLUG}/${PLUGIN_SLUG}.php at its root"

for path in "${FORBIDDEN[@]}"; do
    if echo "$LISTING" | grep -q "^${PLUGIN_SLUG}/${path}\(/\|$\)"; then
        fail "the archive contains ${PLUGIN_SLUG}/${path}"
    fi
done

rm -rf "$DIST_DIR/stage"

FILE_COUNT="$(echo "$LISTING" | wc -l | tr -d ' ')"
echo "build-release: $ARCHIVE ($FILE_COUNT files, $VERSION)"
