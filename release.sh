#!/bin/bash
# =============================================================================
# Release Script — Build, tag, publish to npm, create GitHub release
# =============================================================================
# Usage:
#   ./release.sh <new-version>    — full release from local machine
#   ./release.sh                  — CI mode (derives version from git tag)
#
# If interrupted, re-run with the same version — each step is idempotent.
#
# Prerequisites:
#   - Node.js 20+ and npm installed
#   - npm authenticated (npm whoami) or NODE_AUTH_TOKEN set
#   - gh CLI authenticated (or GITHUB_TOKEN set)
# =============================================================================

set -euo pipefail
trap 'echo -e "\n\033[0;31m  ✗ Release failed at line $LINENO (exit code $?)\033[0m"' ERR

# ---- Helpers ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "\n${CYAN}=== [$1/$TOTAL_STEPS] $2 ===${NC}"; }
info() { echo -e "${GREEN}  ✓ $1${NC}"; }
warn() { echo -e "${YELLOW}  ! $1${NC}"; }
fail() { echo -e "${RED}  ✗ $1${NC}"; exit 1; }

TOTAL_STEPS=6

# ---- Resolve version ----
VERSION="${1:-}"
IS_CI="${CI:-false}"

if [ -z "$VERSION" ]; then
  if [ "$IS_CI" = "true" ] && [ -n "${GITHUB_REF_NAME:-}" ]; then
    VERSION="${GITHUB_REF_NAME#v}"
    info "CI mode — version $VERSION from tag $GITHUB_REF_NAME"
  else
    echo "Usage: ./release.sh <version>"
    echo "  e.g. ./release.sh 1.0.0"
    exit 1
  fi
fi

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  fail "Invalid version format: $VERSION (expected X.Y.Z)"
fi

# ---- Pre-flight checks ----
echo -e "${CYAN}Pre-flight checks...${NC}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

command -v node >/dev/null || fail "node not installed"
command -v npm >/dev/null  || fail "npm not installed"

CURRENT_VERSION=$(node -p "require('./package.json').version")
RESUMING=false

if [ "$CURRENT_VERSION" = "$VERSION" ]; then
  RESUMING=true
  info "Already at v${VERSION} — resuming"
else
  if [ "$IS_CI" != "true" ]; then
    if [ -n "$(git status --porcelain)" ]; then
      fail "Working directory not clean. Commit or stash changes first."
    fi
  fi
  info "Current: v${CURRENT_VERSION} → v${VERSION}"
fi

if [ "$IS_CI" != "true" ] && [ "$RESUMING" != "true" ]; then
  echo ""
  echo -e "${YELLOW}About to release v${VERSION}. This will:${NC}"
  echo "  1. Build + test"
  echo "  2. Bump version in package.json"
  echo "  3. Commit, tag, and push"
  echo "  4. Publish to npm"
  echo "  5. Create GitHub release"
  echo "  6. Verify"
  echo ""
  read -p "Continue? (y/N) " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# =============================================================================
# Step 1: Build + Test
# =============================================================================
step 1 "Build + Test"

npm run build || fail "Build failed"
npm test || fail "Tests failed"
info "All tests passed"

# =============================================================================
# Step 2: Bump version
# =============================================================================
step 2 "Bump version to $VERSION"

if [ "$CURRENT_VERSION" = "$VERSION" ]; then
  info "Already at v${VERSION} — skipping"
else
  npm version "$VERSION" --no-git-tag-version
  info "Version bumped"
fi

# =============================================================================
# Step 3: Commit, tag, and push
# =============================================================================
step 3 "Commit, tag, and push"

if [ "$IS_CI" = "true" ]; then
  info "CI mode — skipping commit/tag/push (already tagged)"
else
  if [ -n "$(git status --porcelain package.json package-lock.json 2>/dev/null)" ]; then
    git add package.json package-lock.json
    git commit -m "v${VERSION}"
    info "Committed version bump"
  else
    info "Nothing to commit"
  fi

  if git tag -l "v${VERSION}" | grep -q "v${VERSION}"; then
    info "Tag v${VERSION} already exists"
  else
    git tag -a "v${VERSION}" -m "v${VERSION}"
    info "Tag v${VERSION} created"
  fi

  git push origin main --follow-tags
  info "Pushed to origin"
fi

# =============================================================================
# Step 4: Publish to npm
# =============================================================================
step 4 "Publish to npm"

PUBLISHED_VERSION=$(npm view @yawlabs/electron-optimize version 2>/dev/null || echo "")

if [ "$PUBLISHED_VERSION" = "$VERSION" ]; then
  info "v${VERSION} already published on npm — skipping"
else
  if [ "$IS_CI" = "true" ]; then
    npm publish --access public --provenance
  else
    npm publish --access public
  fi
  info "Published @yawlabs/electron-optimize@${VERSION} to npm"
fi

# =============================================================================
# Step 5: Create GitHub release
# =============================================================================
step 5 "Create GitHub release"

# Extract the [X.Y.Z] section from CHANGELOG.md, stripping leading blank lines.
# Returns empty stdout if CHANGELOG.md is missing or has no matching section.
# Uses index() rather than ~ matching because gawk strips `\[` escapes from
# regex strings and interprets the result as a character class.
extract_changelog_section() {
  [ -f CHANGELOG.md ] || return 1
  awk -v ver="$VERSION" '
    BEGIN { skip_lead=1 }
    index($0, "## [" ver "]") == 1 { in_section=1; next }
    in_section && index($0, "## [") == 1 { exit }
    in_section && skip_lead && $0 == "" { next }
    in_section { skip_lead=0; print }
  ' CHANGELOG.md
}

if gh release view "v${VERSION}" >/dev/null 2>&1; then
  info "GitHub release v${VERSION} already exists — skipping"
else
  NOTES=$(extract_changelog_section || true)
  if [ -n "$NOTES" ]; then
    REPO_URL=$(gh repo view --json url -q .url 2>/dev/null || echo "")
    if [ -n "$REPO_URL" ]; then
      NOTES="${NOTES}

**Full changelog:** ${REPO_URL}/blob/v${VERSION}/CHANGELOG.md"
    fi
    info "Using CHANGELOG.md [${VERSION}] section for release notes"
  else
    warn "No CHANGELOG.md [${VERSION}] section found — falling back to git log"
    PREV_TAG=$(git tag --sort=-v:refname | grep -A1 "^v${VERSION}$" | tail -1)
    if [ -n "$PREV_TAG" ] && [ "$PREV_TAG" != "v${VERSION}" ]; then
      NOTES=$(git log --oneline "${PREV_TAG}..v${VERSION}" --no-decorate | sed 's/^[a-f0-9]* /- /')
    else
      NOTES="Initial release"
    fi
  fi

  gh release create "v${VERSION}" \
    --title "v${VERSION}" \
    --notes "$NOTES"
  info "GitHub release created"
fi

# =============================================================================
# Step 6: Verify
# =============================================================================
step 6 "Verify"

sleep 3

NPM_VERSION=$(npm view @yawlabs/electron-optimize version 2>/dev/null || echo "")
if [ "$NPM_VERSION" = "$VERSION" ]; then
  info "npm: @yawlabs/electron-optimize@${NPM_VERSION}"
else
  warn "npm shows ${NPM_VERSION:-nothing} (expected $VERSION — may still be propagating)"
fi

PKG_VERSION=$(node -p "require('./package.json').version")
if [ "$PKG_VERSION" = "$VERSION" ]; then
  info "package.json: ${PKG_VERSION}"
else
  warn "package.json shows ${PKG_VERSION} (expected $VERSION)"
fi

if git tag -l "v${VERSION}" | grep -q "v${VERSION}"; then
  info "git tag: v${VERSION}"
else
  warn "git tag v${VERSION} not found"
fi

# =============================================================================
# Done
# =============================================================================
echo ""
echo -e "${GREEN}  v${VERSION} released successfully!${NC}"
echo ""
echo -e "  npm: https://www.npmjs.com/package/@yawlabs/electron-optimize"
echo -e "  git: https://github.com/YawLabs/electron-optimize/releases/tag/v${VERSION}"
echo ""
