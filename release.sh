#!/bin/bash
# =============================================================================
# Release Script -- lint, typecheck, build, test, bump, tag, publish to npm,
# create the GitHub release.
# =============================================================================
# LOCAL ONLY. This repo has no GitHub Actions: Actions is disabled repo-wide
# and the dormant workflows were deleted in 1.3.2. This script is the entire
# release pipeline -- nothing publishes on a tag push.
#
# Usage:
#   ./release.sh <new-version>     e.g. ./release.sh 1.4.0
#
# If interrupted, re-run with the same version -- each step is idempotent.
#
# Prerequisites:
#   - Node.js 20+ and npm installed
#   - npm authenticated (npm whoami) -- publish happens on this machine
#   - gh CLI authenticated
#   - git push access to origin (set GIT_SSH_COMMAND for non-interactive SSH)
# =============================================================================

set -euo pipefail
trap 'echo -e "\n\033[0;31m  x Release failed at line $LINENO (exit code $?)\033[0m"' ERR

# ---- Helpers ----
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

step() { echo -e "\n${CYAN}=== [$1/$TOTAL_STEPS] $2 ===${NC}"; }
info() { echo -e "${GREEN}  + $1${NC}"; }
warn() { echo -e "${YELLOW}  ! $1${NC}"; }
fail() { echo -e "${RED}  x $1${NC}"; exit 1; }

# True when npm itself serves <pkg>@${VERSION}: a 200 from the per-version
# document. NOT `npm view`: that reads the whole packument, which
# registry.npmjs.org serves from Cloudflare's edge for up to 300 s
# (Cache-Control: public, max-age=300; measured 2026-09-28 on the fleet still
# HIT with no-cache request headers), so right after a publish it can keep
# saying the version is absent -- this repo's 1.3.1 and 1.3.2 releases
# (2026-10-07) both hit that lag and each needed a second manual probe. The
# per-version document is served uncached (CF-Cache-Status DYNAMIC). The `_`
# query is belt-and-braces against that changing; npm ignores it. Probe-only:
# any failure reads as "not served".
npm_version_live() {
  local code
  if command -v curl >/dev/null 2>&1; then
    code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 20 \
      -H 'Cache-Control: no-cache' -H 'Pragma: no-cache' \
      "https://registry.npmjs.org/${ENCODED_NAME}/${VERSION}?_=$(date +%s)${RANDOM}" 2>/dev/null || true)
    [ "$code" = "200" ]
  else
    [ "$(npm view "${PKG_NAME}@${VERSION}" version --prefer-online 2>/dev/null || echo "")" = "$VERSION" ]
  fi
}

# --- CHANGELOG promotion (ported from electron-mcp / the mcp_servers fleet) --
# The previous release.sh here only EXTRACTED a [X.Y.Z] section for the GitHub
# release notes; it never promoted [Unreleased], so the cut had to be done by
# hand as a separate commit -- 1.3.1 and 1.3.2 (2026-10-07) both shipped that
# way, and a forgotten cut means documented work accumulates under
# [Unreleased] and published versions go out undocumented. The fleet fixed the
# same failure with seven backfilled entries on 2026-08-23.
#
# Every release now gets a `## [<version>]` entry, and step 6 sources the
# release notes from it:
#   * [Unreleased] has content -> it becomes the version section, and a fresh,
#     empty [Unreleased] heading is left above it for the next change.
#   * [Unreleased] is empty or absent -> a version section is generated from
#     the commit subjects since the previous tag. Raw subjects are less than a
#     hand-written entry, but a version with no entry at all reads as a mistake.
#   * The Keep-a-Changelog link references at the bottom, when the file has
#     them, are moved along: [Unreleased] compares from the new tag, and the
#     version gets its own compare link.

changelog_section() {
  [ -f CHANGELOG.md ] || return 0
  awk -v heading="$1" '
    index($0, "## [" heading "]") == 1 { capture=1; next }
    capture && /^## \[/ { exit }
    capture { print }
  ' CHANGELOG.md
}

# True when a section body carries any non-whitespace content.
changelog_nonempty() { [ -n "$(echo "$1" | tr -d '[:space:]')" ]; }

# Reuse whatever separator this file already puts between version and date.
# This repo uses " - "; the fleet mixes an em-dash and "--". Promoting with a
# hardcoded one would introduce a second style into the repos that do not use
# it.
changelog_dash() {
  local d
  d=$(sed -nE 's/^## \[[0-9][^]]*\][[:space:]]+([^[:space:]]+)[[:space:]]+[0-9]{4}-[0-9]{2}-[0-9]{2}.*/\1/p' CHANGELOG.md 2>/dev/null | head -1)
  if [ -n "$d" ]; then printf '%s' "$d"; else printf '%s' '--'; fi
}

# The tag this release is compared against: the newest v* tag reachable from
# HEAD other than this release's own (a re-run after tagging must not compare
# the version with itself). Empty on a first release.
changelog_prev_tag() {
  git describe --tags --abbrev=0 --match 'v*' --exclude "v${VERSION}" 2>/dev/null || true
}

# The body of a generated entry: one bullet per commit subject since the
# previous tag, newest first, with version-bump commits dropped.
changelog_generated_body() {
  local prev=$1 range subjects
  if [ -n "$prev" ]; then range="${prev}..HEAD"; else range="HEAD"; fi
  subjects=$(git log --no-merges --format='%s' "$range" 2>/dev/null \
    | grep -vE '^v[0-9]+\.[0-9]+\.[0-9]+$' | sed 's/^/- /' || true)
  [ -n "$subjects" ] || subjects="- Maintenance release; no changes since ${prev:-the previous release}."
  printf '### Changed\n%s\n' "$subjects"
}

# Keep-a-Changelog link references, when the file uses them: [Unreleased]
# compares from the new tag, and the version gets its own compare link (or a
# tag link on a first release). A version link that already exists is kept.
changelog_update_links() {
  local prev=$1 tmp
  grep -qE '^\[Unreleased\]: .*/compare/.*\.\.\.HEAD' CHANGELOG.md || return 0
  tmp=$(mktemp)
  awk -v ver="$VERSION" -v prev="$prev" -v have_link="$(grep -c "^\[${VERSION}\]: " CHANGELOG.md || true)" '
    !done && /^\[Unreleased\]: .*\/compare\/.*\.\.\.HEAD/ {
      url=$0; sub(/^\[Unreleased\]: /, "", url); sub(/\/compare\/.*$/, "", url)
      print "[Unreleased]: " url "/compare/v" ver "...HEAD"
      if (have_link == 0) {
        if (prev != "") print "[" ver "]: " url "/compare/" prev "...v" ver
        else print "[" ver "]: " url "/releases/tag/v" ver
      }
      done=1; next
    }
    { print }
  ' CHANGELOG.md > "$tmp" || { rm -f "$tmp"; fail "CHANGELOG.md link update failed"; }
  mv "$tmp" CHANGELOG.md
}

# Make sure `## [<version>] <dash> <today>` exists: promote [Unreleased] when it
# has content, otherwise generate the section from the commit subjects.
promote_changelog() {
  [ -f CHANGELOG.md ] || return 0
  local prev
  prev=$(changelog_prev_tag)
  if changelog_nonempty "$(changelog_section "$VERSION")"; then
    info "CHANGELOG.md already has an entry for v${VERSION}"
    changelog_update_links "$prev"
    return 0
  fi
  local today tmp dash heading body
  today=$(date +%F)
  dash=$(changelog_dash)
  heading="## [${VERSION}] ${dash} ${today}"
  tmp=$(mktemp)
  if changelog_nonempty "$(changelog_section "Unreleased")"; then
    # Rewrite only the FIRST [Unreleased] heading: a stray later mention (a link
    # reference, a quoted example) must not become a second, bogus heading.
    awk -v repl="$heading" '
      !promoted && index($0, "## [Unreleased]") == 1 { print "## [Unreleased]"; print ""; print repl; promoted=1; next }
      { print }
    ' CHANGELOG.md > "$tmp" || { rm -f "$tmp"; fail "CHANGELOG.md promotion failed"; }
    info "CHANGELOG.md: promoted [Unreleased] -> [${VERSION}] ${dash} ${today}"
  else
    body=$(changelog_generated_body "$prev")
    warn "CHANGELOG.md has no [Unreleased] content -- writing [${VERSION}] from the commit subjects since ${prev:-the first commit}; edit it if they undersell the release"
    # Insert below an empty [Unreleased] heading, else above the first version
    # heading, else at the end of the file.
    awk -v heading="$heading" -v body="$body" '
      !done && index($0, "## [Unreleased]") == 1 { print; print ""; print heading; print ""; print body; done=1; next }
      !done && /^## \[/ { print heading; print ""; print body; print ""; done=1 }
      { print }
      END { if (!done) { print ""; print heading; print ""; print body } }
    ' CHANGELOG.md > "$tmp" || { rm -f "$tmp"; fail "CHANGELOG.md entry generation failed"; }
    info "CHANGELOG.md: added [${VERSION}] ${dash} ${today} from commit subjects"
  fi
  mv "$tmp" CHANGELOG.md
  changelog_update_links "$prev"
}

# Backstop for the promotion above: every release has an entry now, so a
# missing one means promote_changelog did not run or did not land, and the
# release notes in step 6 would silently fall back to commit subjects.
assert_changelog_promoted() {
  [ -f CHANGELOG.md ] || return 0
  changelog_nonempty "$(changelog_section "$VERSION")" && return 0
  fail "CHANGELOG.md has no '## [${VERSION}]' entry -- promote_changelog did not run or did not land."
}

# Release notes for step 6: the version's changelog section, trimmed of the
# blank lines around it; commit subjects only when there is no changelog.
release_notes() {
  local notes
  notes=$(changelog_section "$VERSION" | sed -e '/./,$!d' | sed -e :a -e '/^\n*$/{$d;N;ba' -e '}')
  if changelog_nonempty "$notes"; then
    printf '%s\n' "$notes"
  elif [ -n "${1:-}" ] && [ "$1" != "v${VERSION}" ]; then
    git log --oneline "${1}..v${VERSION}" --no-decorate | sed 's/^[a-f0-9]* /- /'
  else
    printf 'Initial release\n'
  fi
}

# SKIP_LINT=1 escape hatch -- wraps `npm` so lint-related runs are no-ops.
#
# THIS SHOULD BE UNNECESSARY, and reaching for it is a signal something
# regressed. `npm run lint` routes through scripts/lint.mjs, which picks a
# biome binary that works on the host -- including Windows ARM64, where some
# biome versions ship a broken arm64 executable, so the wrapper provisions the
# x64 build of the SAME version and runs that under emulation.
#
# There is no CI behind this step: the workflows were deleted in 1.3.2 and
# Actions was disabled before that, so step 1's `npm run lint` is the ONLY
# lint gate. Skipping it means the release is published unlinted, full stop.
#
# So: only set SKIP_LINT=1 if scripts/lint.mjs cannot produce a result at all,
# and treat that as a bug to fix rather than a step to routinely skip.
if [ "${SKIP_LINT:-}" = "1" ]; then
  npm() {
    if [ "$1" = "run" ] && [[ "$2" == lint* ]]; then
      warn "SKIP_LINT=1 -- noop 'npm run $2'"
      return 0
    fi
    command npm "$@"
  }
fi

TOTAL_STEPS=7

# ---- Resolve version ----
# Local-only: no CI mode. GitHub Actions is disabled and the workflows were
# deleted (1.3.2), so there is no tag-triggered caller to derive a version.
if [ "${CI:-}" = "true" ]; then
  fail "CI=true is set but this repo has no CI release path -- run release.sh locally with a version argument"
fi

VERSION="${1:-}"
if [ -z "$VERSION" ]; then
  echo "Usage: ./release.sh <version>"
  echo "  e.g. ./release.sh 1.4.0"
  exit 1
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
command -v gh >/dev/null   || fail "gh CLI not installed"

PKG_NAME=$(node -p "require('./package.json').name")
# Scoped-slash encoded for the per-version registry URL (@yawlabs%2Fpkg).
ENCODED_NAME="${PKG_NAME//\//%2F}"

# Verify the npm session exists BEFORE any mutating step. Without this, the
# script happily lints, builds, bumps, commits, tags, and pushes -- then dies
# at step 5 with E404 from the registry, leaving a tag on origin and a
# half-shipped release (fleet: aws-mcp v1.2.9, 2026-05-19). Publishes on this
# repo happen from this machine only -- there is no CI fallback to defer to.
if ! NPM_USER=$(npm whoami 2>/dev/null); then
  fail "npm is not authenticated. The automation token in ~/.npmrc is missing or dead -- replace it with a new automation token from npmjs.com (Access Tokens -> Generate -> Automation). Do NOT run 'npm login --auth-type=web': it overwrites the automation token with a 2FA-bound web session."
fi
info "npm session: ${NPM_USER}"

CURRENT_VERSION=$(node -p "require('./package.json').version")
RESUMING=false

if [ "$CURRENT_VERSION" = "$VERSION" ]; then
  RESUMING=true
  info "Already at v${VERSION} -- resuming"
else
  if [ -n "$(git status --porcelain)" ]; then
    fail "Working directory not clean. Commit or stash changes first."
  fi
  info "Current: v${CURRENT_VERSION} -> v${VERSION}"
fi

if [ "$RESUMING" != "true" ]; then
  echo ""
  echo -e "${YELLOW}About to release v${VERSION}. This will:${NC}"
  echo "  1. Lint + typecheck"
  echo "  2. Build + test"
  echo "  3. Bump version in package.json"
  echo "  4. Commit, tag, and push"
  echo "  5. Publish to npm"
  echo "  6. Create GitHub release"
  echo "  7. Verify"
  echo ""
  if [ -t 0 ]; then
    read -p "Continue? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      echo "Aborted."
      exit 0
    fi
  else
    info "Non-interactive shell -- proceeding without confirmation"
  fi
fi

# =============================================================================
# Step 1: Lint + typecheck
# =============================================================================
step 1 "Lint + typecheck"

npm run lint || fail "Lint failed"
npm run typecheck || fail "Type check failed"
info "Lint + typecheck passed"

# =============================================================================
# Step 2: Build + test
# =============================================================================
step 2 "Build + test"

npm run build || fail "Build failed"
npm test || fail "Tests failed"
info "Build + tests passed"

# =============================================================================
# Step 3: Bump version
# =============================================================================
step 3 "Bump version to $VERSION"

if [ "$CURRENT_VERSION" = "$VERSION" ]; then
  info "Already at v${VERSION} -- skipping"
else
  npm version "$VERSION" --no-git-tag-version
  info "Version bumped"
fi

# Promote the heading BEFORE the bump commit, so the rewrite is committed
# with the version bump rather than left dirty in the working tree.
promote_changelog
assert_changelog_promoted

# =============================================================================
# Step 4: Commit, tag, and push
# =============================================================================
step 4 "Commit, tag, and push"

BUMP_FILES="package.json package-lock.json"
[ -f CHANGELOG.md ] && BUMP_FILES="$BUMP_FILES CHANGELOG.md"
if [ -n "$(git status --porcelain $BUMP_FILES 2>/dev/null)" ]; then
  git add $BUMP_FILES
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

# Tag-drift safety: refuse to push if origin already has a tag at this name
# pointing to a different commit (rewound tag elsewhere, parallel release race).
# Without this check, a re-push SILENTLY skips updating the tag on origin (the
# tag exists, no fast-forward happens): the main push reports success but
# origin's tag stays at the old SHA, and the GitHub release in step 6 is then
# linked to the stale commit while npm carries the new one.
ORIGIN_TAG_SHA=$(git ls-remote --tags origin "refs/tags/v${VERSION}" 2>/dev/null | awk '{print $1}')
if [ -n "$ORIGIN_TAG_SHA" ]; then
  LOCAL_TAG_SHA=$(git rev-parse "v${VERSION}")
  if [ "$ORIGIN_TAG_SHA" != "$LOCAL_TAG_SHA" ]; then
    fail "Tag v${VERSION} exists on origin at $ORIGIN_TAG_SHA but local tag points to $LOCAL_TAG_SHA -- resolve the drift before re-running"
  fi
fi

# Two pushes, not `git push --follow-tags`: --follow-tags only ships annotated
# tags reachable from refs that are *actually being updated*, so on a resumed
# run where main is already on origin (publish failed last time, retry today)
# the no-op main push wouldn't carry the tag along. The explicit tag push
# always lands the tag, first run or resume.
git push origin main
git push origin "v${VERSION}"
info "Pushed to origin"

# =============================================================================
# Step 5: Publish to npm
# =============================================================================
step 5 "Publish to npm"

if npm_version_live; then
  info "v${VERSION} already published on npm -- skipping"
else
  # Retry only on EOTP/EAUTH/OTP for fresh WebAuthn sessions; npm's
  # already-published E403 (below) counts as done; fail fast on everything else.
  ATTEMPT=1
  MAX_ATTEMPTS=3
  NPM_ALREADY_THERE=false
  while true; do
    PUBLISH_LOG=$(mktemp)
    if npm publish --access public 2>&1 | tee "$PUBLISH_LOG"; then
      rm -f "$PUBLISH_LOG"
      break
    fi
    # npm's own word that the version is already there: the E403 "You cannot
    # publish over the previously published versions". Reachable when the skip
    # check above missed a version npm holds -- its read path lagging the
    # write, or this host unable to read it -- which is the state an immediate
    # re-run after a failed later step starts from. Treated as the skip it
    # should have been, not as a token problem.
    if grep -q 'cannot publish over the previously published versions' "$PUBLISH_LOG"; then
      rm -f "$PUBLISH_LOG"
      NPM_ALREADY_THERE=true
      break
    fi
    if ! grep -qE 'EOTP|EAUTH|one-time password|OTP' "$PUBLISH_LOG"; then
      rm -f "$PUBLISH_LOG"
      fail "npm publish failed (non-OTP error -- see output above).

  If the error was E401 or E404, the automation token in ~/.npmrc is dead.
  npm answers an UNAUTHORIZED PUT with 404, not 401, so 'could not be found
  or you do not have permission' here almost always means 'not authorized'
  -- the package is fine. Confirm which it is:

      npm whoami          # E401 => the token is dead

  Fix: mint a NEW automation token (npmjs.com -> Access Tokens -> Generate
  -> Automation), then write these two lines to ~/.npmrc:

      @yawlabs:registry=https://registry.npmjs.org/
      //registry.npmjs.org/:_authToken=npm_YOURTOKEN

  Do NOT run 'npm login --auth-type=web'. It OVERWRITES the automation token
  with a 2FA-bound web session; the next publish then EOTPs on a WebAuthn
  challenge."
    fi
    rm -f "$PUBLISH_LOG"
    if [ $ATTEMPT -ge $MAX_ATTEMPTS ]; then
      fail "npm publish failed after $MAX_ATTEMPTS OTP-class attempts. WebAuthn session may not be propagating."
    fi
    warn "npm publish attempt $ATTEMPT EOTPed -- waiting 30s for WebAuthn session to propagate"
    ATTEMPT=$((ATTEMPT + 1))
    sleep 30
  done
  if [ "$NPM_ALREADY_THERE" = "true" ]; then
    warn "npm already holds ${PKG_NAME}@${VERSION} (its E403 said so) though the pre-publish read did not show it -- treating the publish as done"
  else
    info "Published ${PKG_NAME}@${VERSION} to npm (workstation)"
  fi
fi

# =============================================================================
# Step 6: Create GitHub release
# =============================================================================
step 6 "Create GitHub release"

if gh release view "v${VERSION}" >/dev/null 2>&1; then
  info "GitHub release v${VERSION} already exists -- skipping"
else
  # Most recent tag reachable from v${VERSION}'s parent. Using git's own
  # ancestry beats sort+grep+tail on tag names: a stray future tag (e.g.
  # someone pre-tagging v2.0.0 ahead of an actual v1.x release) sorts above
  # the current one and corrupts a name-based "previous" lookup. Ancestry
  # walks the commit graph instead. If there's no prior tag (initial
  # release), git describe exits non-zero and PREV_TAG stays empty.
  PREV_TAG=$(git describe --tags --abbrev=0 "v${VERSION}^" 2>/dev/null || echo "")
  NOTES=$(release_notes "$PREV_TAG")

  # --notes-file, not --notes: the body is a whole CHANGELOG section, and
  # passing that as a command-line ARGUMENT exceeds the ~32kB CreateProcess
  # limit on Windows -- `gh: Argument list too long`, exit 126 (fleet:
  # tailscale-mcp v0.21.0 died in exactly that step AFTER npm had published;
  # mcp-compliance hit it at 62kB). A file has no such limit anywhere.
  NOTES_FILE=$(mktemp)
  printf '%s\n' "$NOTES" > "$NOTES_FILE"
  gh release create "v${VERSION}" \
    --title "v${VERSION}" \
    --notes-file "$NOTES_FILE"
  rm -f "$NOTES_FILE"
  info "GitHub release created (notes from CHANGELOG.md [${VERSION}])"
fi

# --- npm propagation gate (not a step of its own) ---------------------------
# `npm publish` returns as soon as the registry ACCEPTS the tarball, but the
# version is not immediately readable from the CDN-backed read path -- the lag
# this repo observed on 1.3.1 and 1.3.2 (2026-10-07). Polling here makes one
# invocation self-verifying. WARN, never fail, on timeout: the verify step
# below reports the same condition, and this gate can only make the release
# faster, never worse than it was before it existed.
if [ "${SKIP_NPM_WAIT:-}" = "1" ]; then
  warn "SKIP_NPM_WAIT=1 -- not waiting for npm to serve v${VERSION}"
elif ! command -v curl >/dev/null 2>&1; then
  warn "curl not found -- skipping the npm propagation wait"
else
  NPM_WAIT_TIMEOUT_S=${NPM_WAIT_TIMEOUT_S:-600}
  NPM_WAITED_S=0
  # 5s: a remote read on a minutes-scale wait, so a tighter spin buys nothing.
  while [ "$NPM_WAITED_S" -lt "$NPM_WAIT_TIMEOUT_S" ]; do
    if npm_version_live; then
      break
    fi
    sleep 5
    NPM_WAITED_S=$((NPM_WAITED_S + 5))
  done
  if [ "$NPM_WAITED_S" -ge "$NPM_WAIT_TIMEOUT_S" ]; then
    warn "npm still does not serve ${PKG_NAME}@${VERSION} after ${NPM_WAIT_TIMEOUT_S}s -- continuing anyway"
  elif [ "$NPM_WAITED_S" -gt 0 ]; then
    info "npm is serving v${VERSION} (waited ${NPM_WAITED_S}s for propagation)"
  else
    info "npm is already serving v${VERSION}"
  fi
fi

# =============================================================================
# Step 7: Verify
# =============================================================================
step 7 "Verify"

# Poll rather than read once: propagation has taken minutes on this repo, and
# the pre-publish read can serve a stale CDN answer for up to 300s.
NPM_VERSION=""
for i in $(seq 1 120); do
  if npm_version_live; then NPM_VERSION="$VERSION"; break; fi
  if [ "$i" -lt 120 ]; then sleep 5; fi
done
if [ "$NPM_VERSION" = "$VERSION" ]; then
  info "npm: ${PKG_NAME}@${NPM_VERSION}"
else
  warn "npm shows ${NPM_VERSION:-nothing} (expected $VERSION -- may still be propagating)"
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
echo -e "  npm: https://www.npmjs.com/package/${PKG_NAME}"
echo -e "  git: https://github.com/YawLabs/electron-optimize/releases/tag/v${VERSION}"
echo ""