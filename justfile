# Root Justfile for @toolwind/upgrade project

# Default recipe: List available commands for the upgrade package
default:
    @just --list --list-heading 'Available commands for @toolwind/upgrade package:\n'

# === @toolwind/upgrade Package Commands ===

# Build the @toolwind/upgrade package
build:
    @echo "Building @toolwind/upgrade package..."
    pnpm turbo build --filter='@toolwind/upgrade'

# Run the package's dev script (build --watch)
watch:
    @echo "Starting dev watch for @toolwind/upgrade..."
    cd packages/@tailwindcss-upgrade && pnpm run dev

# Lint the @toolwind/upgrade package
lint:
    @echo "Linting @toolwind/upgrade package..."
    pnpm turbo lint --filter='@toolwind/upgrade'

# Format the @toolwind/upgrade package code
format:
    @echo "Formatting @toolwind/upgrade package..."
    pnpm prettier --write packages/@tailwindcss-upgrade

# Clean build artifacts for @toolwind/upgrade
clean:
    @echo "Cleaning @toolwind/upgrade package..."
    pnpm turbo clean --filter='@toolwind/upgrade'

# Show the current package version
version:
    @jq -r '.version' packages/@tailwindcss-upgrade/package.json

# --- Publish Recipes ---

# Publish the package (requires build first via dependency)
# Argument: dev | stable
publish level:
    #!/usr/bin/env bash
    # Validate argument first
    if [[ "{{level}}" != "dev" && "{{level}}" != "stable" ]]; then \
        echo -e "\033[0;31mError: Invalid argument '{{level}}'. Use 'dev' or 'stable'.\033[0m"; \
        exit 1; \
    fi
    if [[ "{{level}}" == "dev" ]]; then \
    # Explicitly run check, then the publish-actual (which depends on build)
    just _check-version-is-dev && just _publish-dev-actual
    else \
    # Explicitly run check, then the publish-actual (which depends on build)
    just _check-version-is-stable && just _publish-stable-actual
    fi

# Placeholder for tests if added later
test:
    @echo "Running tests for @toolwind/upgrade..."
    # Assuming tests would be run via turbo if set up
    pnpm turbo test --filter='@toolwind/upgrade'

# === Bumping Recipes ===

# Bump the version in package.json files.
# Argument: dev | patch | minor | major | stable | dev-patch | dev-minor | dev-major
#   dev:    Increments existing -dev.N suffix (e.g., 4.1.5-dev.0 -> 4.1.5-dev.1)
#   patch:  Increments patch version, removes suffix (e.g., 4.1.5 / 4.1.5-dev.21 -> 4.1.6)
#   minor:  Increments minor, resets patch to 0, removes suffix (e.g., 4.1.5 / 4.1.5-dev.21 -> 4.2.0)
#   major:  Increments major, resets minor/patch to 0, removes suffix (e.g., 4.1.5 / 4.1.5-dev.21 -> 5.0.0)
#   stable: Removes pre-release suffix (e.g., 4.1.5-dev.21 -> 4.1.5)
#   dev-patch: From stable X.Y.Z, starts dev cycle at X.Y.Z+1-dev.0
#   dev-minor: From stable X.Y.Z, starts dev cycle at X.Y+1.0-dev.0
#   dev-major: From stable X.Y.Z, starts dev cycle at X+1.0.0-dev.0
# WARNING: Does not perform git checks or commits!
bump level:
    #!/usr/bin/env bash
    set -e # Exit immediately if a command exits with a non-zero status.

    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    ROOT_PKG_FILE="package.json"
    PKG_NAME="@toolwind/upgrade"
    ROOT_PKG_NAME="${PKG_NAME}-root"

    # Validate argument
    valid_levels=("dev" "patch" "minor" "major" "stable" "dev-patch" "dev-minor" "dev-major")
    is_valid=false
    for valid in "${valid_levels[@]}"; do
        if [[ "{{level}}" == "$valid" ]]; then
            is_valid=true
            break
        fi
    done
    if [[ "$is_valid" == false ]]; then
        echo -e "\033[0;31mError: Invalid argument '{{level}}'. Use one of: ${valid_levels[*]}.\033[0m";
        exit 1;
    fi

    echo "Bumping version (level: {{level}}) in package.json files..."

    # Get the full current package version
    CURRENT_VERSION_FULL=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/')
    echo "Current full package version: $CURRENT_VERSION_FULL"

    # Determine current state
    is_dev=false
    is_stable=false
    if echo "$CURRENT_VERSION_FULL" | grep -qE -- '^[0-9]+\.[0-9]+\.[0-9]+$'; then
        is_stable=true
    elif echo "$CURRENT_VERSION_FULL" | grep -qE -- '^[0-9]+\.[0-9]+\.[0-9]+-dev\.[0-9]+$'; then
        is_dev=true
    else
        echo -e "\033[0;31mError: Current version '$CURRENT_VERSION_FULL' is neither stable (X.Y.Z) nor dev (X.Y.Z-dev.N).\033[0m";
        exit 1
    fi

    # --- Calculate New Version ---
    NEW_VERSION=""
    BASE_VERSION=$(echo "$CURRENT_VERSION_FULL" | sed -E 's/([0-9]+\.[0-9]+\.[0-9]+).*/\1/')
    MAJOR=$(echo "$BASE_VERSION" | cut -d. -f1)
    MINOR=$(echo "$BASE_VERSION" | cut -d. -f2)
    PATCH=$(echo "$BASE_VERSION" | cut -d. -f3)

    case "{{level}}" in
        dev)
            if [[ "$is_dev" == false ]]; then
                echo -e "\033[0;31mError: 'bump dev' requires the current version ($CURRENT_VERSION_FULL) to be a dev version. Use 'bump stable' first or 'bump dev-patch|minor|major' to start a new dev cycle.\033[0m";
                exit 1;
            fi
            DEV_NUMBER=$(echo "$CURRENT_VERSION_FULL" | sed -E 's/.*-dev\.([0-9]+)$/\1/')
            NEXT_DEV_NUMBER=$((DEV_NUMBER + 1))
            NEW_VERSION="$BASE_VERSION-dev.$NEXT_DEV_NUMBER"
            ;;
        patch)
            NEXT_PATCH=$((PATCH + 1))
            NEW_VERSION="$MAJOR.$MINOR.$NEXT_PATCH"
            ;;
        minor)
            NEXT_MINOR=$((MINOR + 1))
            NEW_VERSION="$MAJOR.$NEXT_MINOR.0"
            ;;
        major)
            NEXT_MAJOR=$((MAJOR + 1))
            NEW_VERSION="$NEXT_MAJOR.0.0"
            ;;
        stable)
            if [[ "$is_dev" == false ]]; then
                echo -e "\033[0;31mError: 'bump stable' requires the current version ($CURRENT_VERSION_FULL) to be a pre-release version. Use 'bump dev-patch|minor|major' to start a new dev cycle.\033[0m";
                exit 1;
            fi
            NEW_VERSION="$BASE_VERSION"
            ;;
        dev-patch)
            if [[ "$is_stable" == false ]]; then
                echo -e "\033[0;31mError: 'bump dev-patch' requires the current version ($CURRENT_VERSION_FULL) to be stable. Use 'bump stable' first.\033[0m";
                exit 1;
            fi
            NEXT_PATCH=$((PATCH + 1))
            NEW_VERSION="$MAJOR.$MINOR.$NEXT_PATCH-dev.0"
            ;;
        dev-minor)
            if [[ "$is_stable" == false ]]; then
                echo -e "\033[0;31mError: 'bump dev-minor' requires the current version ($CURRENT_VERSION_FULL) to be stable. Use 'bump stable' first.\033[0m";
                exit 1;
            fi
            NEXT_MINOR=$((MINOR + 1))
            NEW_VERSION="$MAJOR.$NEXT_MINOR.0-dev.0"
            ;;
        dev-major)
            if [[ "$is_stable" == false ]]; then
                echo -e "\033[0;31mError: 'bump dev-major' requires the current version ($CURRENT_VERSION_FULL) to be stable. Use 'bump stable' first.\033[0m";
                exit 1;
            fi
            NEXT_MAJOR=$((MAJOR + 1))
            NEW_VERSION="$NEXT_MAJOR.0.0-dev.0"
            ;;
    esac

    echo "New version:                 $NEW_VERSION"

    # --- Update Package package.json ---
    echo "Updating $PKG_FILE..."
    cp $PKG_FILE "$PKG_FILE.bak"
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_VERSION_FULL\"#\"version\": \"$NEW_VERSION\"#" $PKG_FILE || exit 1
    rm "$PKG_FILE.tmp"
    rm "$PKG_FILE.bak"

    # --- Update Root package.json ---
    echo "Updating root $ROOT_PKG_FILE..."
    CURRENT_ROOT_VERSION=$(jq -r '.version' "$ROOT_PKG_FILE")
    CURRENT_ROOT_NAME=$(jq -r '.name' "$ROOT_PKG_FILE")
    if [ -z "$CURRENT_ROOT_VERSION" ] || [ -z "$CURRENT_ROOT_NAME" ]; then
        echo "Error: Failed to extract current name or version from root package.json using jq."
        exit 1
    fi
    cp $ROOT_PKG_FILE "$ROOT_PKG_FILE.bak"
    sed -i.tmp "s#\"name\":[[:space:]]*\"$CURRENT_ROOT_NAME\"#\"name\": \"$ROOT_PKG_NAME\"#" $ROOT_PKG_FILE || exit 1
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_ROOT_VERSION\"#\"version\": \"$NEW_VERSION\"#" $ROOT_PKG_FILE || exit 1
    rm "$ROOT_PKG_FILE.tmp" # sed creates two .tmp files on macOS, remove both
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Version bumped successfully!"

# === Internal Helper Recipes ===

# Check if the current package version is a dev version (-dev.N)
_check-version-is-dev:
    #!/usr/bin/env bash
    echo "Checking if package version is a dev version..."
    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    CURRENT_VERSION=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/')
    if ! echo "$CURRENT_VERSION" | grep -qE -- '-dev\.[0-9]+$'; then \
        echo -e "\033[0;31mError: Current version ($CURRENT_VERSION) is not a dev version (-dev.N). Use 'publish stable' for stable releases.\033[0m"; \
        exit 1; \
    fi

# Check if the current package version is stable (no pre-release tag)
_check-version-is-stable:
    #!/usr/bin/env bash
    echo "Checking if package version is a stable version..."
    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    CURRENT_VERSION=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/')
    if echo "$CURRENT_VERSION" | grep -qE -- '-'; then \
        echo -e "\033[0;31mError: Current version ($CURRENT_VERSION) looks like a pre-release version. Use 'set-stable' first, or use 'publish dev'.\033[0m"; \
        exit 1; \
    fi

# Internal recipe to format and publish dev (depends on build)
_publish-dev-actual: build
    #!/usr/bin/env bash
    echo "Formatting @toolwind/upgrade package (for dev publish)..."
    pnpm prettier --write packages/@tailwindcss-upgrade
    CURRENT_VERSION=$(grep '"version":' packages/@tailwindcss-upgrade/package.json | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/') # Read version again just for echo
    echo "Publishing DEV version ($CURRENT_VERSION) of @toolwind/upgrade..."
    pnpm publish --filter @toolwind/upgrade --tag dev --no-git-checks

# Internal recipe to format and publish stable (depends on build)
_publish-stable-actual: build
    #!/usr/bin/env bash
    echo "Formatting @toolwind/upgrade package (for stable publish)..."
    pnpm prettier --write packages/@tailwindcss-upgrade
    CURRENT_VERSION=$(grep '"version":' packages/@tailwindcss-upgrade/package.json | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/') # Read version again just for echo
    echo "Publishing STABLE version ($CURRENT_VERSION) of @toolwind/upgrade..."
    pnpm publish --filter @toolwind/upgrade --no-git-checks

# Revert ONLY the version number in package.json files to the most recent *different* version found in git history.
# WARNING: This only reverts the version string, not other file content changes.
# WARNING: Assumes the last commit included the version bump you want to undo.
# WARNING: Does not perform git checks or commits!
revert-version:
    #!/usr/bin/env bash
    set -e

    echo "Attempting to revert ONLY version number in package.json files to previous different version..."
    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    ROOT_PKG_FILE="package.json"
    PKG_NAME="@toolwind/upgrade"
    ROOT_PKG_NAME="${PKG_NAME}-root"
    MAX_COMMITS_TO_CHECK=50 # Limit how far back we search

    # --- Get Current Versions ---
    CURRENT_PKG_VERSION=$(jq -r '.version' "$PKG_FILE")
    CURRENT_ROOT_VERSION=$(jq -r '.version' "$ROOT_PKG_FILE")
    CURRENT_ROOT_NAME=$(jq -r '.name' "$ROOT_PKG_FILE")

    echo "Current Package Version: $CURRENT_PKG_VERSION"
    echo "Current Root Version:    $CURRENT_ROOT_VERSION"

    # --- Find Previous Different Package Version ---
    echo "Searching git history for previous different version (max $MAX_COMMITS_TO_CHECK commits)..."
    PREVIOUS_PKG_VERSION=""
    for i in $(seq 1 $MAX_COMMITS_TO_CHECK); do
        COMMIT_HASH="HEAD~$i"
        # Check if commit exists before trying to show
        if ! git cat-file -e "$COMMIT_HASH" 2>/dev/null; then
             echo "Reached end of relevant history (or checked $MAX_COMMITS_TO_CHECK commits)."
             break
        fi
        # Try to get version from the file at that commit, ignore errors if file didn't exist or jq fails
        HISTORICAL_VERSION=$(git show "$COMMIT_HASH":"$PKG_FILE" 2>/dev/null | jq -r '.version' 2>/dev/null || echo "")

        if [[ -n "$HISTORICAL_VERSION" && "$HISTORICAL_VERSION" != "$CURRENT_PKG_VERSION" ]]; then
            PREVIOUS_PKG_VERSION="$HISTORICAL_VERSION"
            echo "Found previous different version ($PREVIOUS_PKG_VERSION) in commit $COMMIT_HASH."
            break
        fi
    done

    if [ -z "$PREVIOUS_PKG_VERSION" ]; then
        echo -e "\033[0;31mError: Could not find a previous commit with a different version within the last $MAX_COMMITS_TO_CHECK commits.\033[0m"
        exit 1
    fi

    # --- Update Package package.json ---
    echo "Reverting version in $PKG_FILE to $PREVIOUS_PKG_VERSION..."
    cp $PKG_FILE "$PKG_FILE.bak"
    # Use # delimiter for sed, target specific current version
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_PKG_VERSION\"#\"version\": \"$PREVIOUS_PKG_VERSION\"#" $PKG_FILE || exit 1
    rm "$PKG_FILE.tmp"
    rm "$PKG_FILE.bak"

    # --- Update Root package.json ---
    echo "Reverting version in root $ROOT_PKG_FILE..."
    if [ -z "$CURRENT_ROOT_VERSION" ] || [ -z "$CURRENT_ROOT_NAME" ]; then
        echo "Warning: Failed to extract current name or version from root package.json using jq. Skipping root update."
    else
        cp $ROOT_PKG_FILE "$ROOT_PKG_FILE.bak"
        # Only update version in root, keep name as is
        sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_ROOT_VERSION\"#\"version\": \"$PREVIOUS_PKG_VERSION\"#" $ROOT_PKG_FILE || exit 1
        rm "$ROOT_PKG_FILE.tmp"
        rm "$ROOT_PKG_FILE.bak"
    fi

    echo "Version revert successful!"
    echo "New Package Version: $PREVIOUS_PKG_VERSION"
    echo "New Root Version:    $PREVIOUS_PKG_VERSION (if root update succeeded)"
    echo "Please review and commit the changes." 