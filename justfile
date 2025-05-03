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

# --- Publish Recipes ---

# Publish the package (requires build first via dependency)
# Argument: dev | stable
publish level: _check-version-is-dev _check-version-is-stable _publish-dev-actual _publish-stable-actual
    # This recipe just orchestrates dependencies based on the level argument checked by the _check-* recipes.
    @# The actual work happens in the dependent helper recipes.
    @if [[ "{{level}}" != "dev" && "{{level}}" != "stable" ]]; then \
        echo -e "\033[0;31mError: Invalid argument '{{level}}'. Use 'dev' or 'stable'.\033[0m"; \
        exit 1; \
    fi
    # Echo based on the intended path
    @if [[ "{{level}}" == "dev" ]]; then \
        echo "Attempting dev publish..."; \
    else \
        echo "Attempting stable publish..."; \
    fi

# Placeholder for tests if added later
test:
    @echo "Running tests for @toolwind/upgrade..."
    # Assuming tests would be run via turbo if set up
    pnpm turbo test --filter='@toolwind/upgrade'

# Bump the dev version suffix (e.g., -dev.0 -> -dev.1) in the package.json
# WARNING: Does not perform git checks or commits!
bump-dev:
    #!/usr/bin/env bash
    set -e # Exit immediately if a command exits with a non-zero status.

    echo "Bumping dev version in packages/@tailwindcss-upgrade/package.json..."
    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    ROOT_PKG_FILE="package.json"
    PKG_NAME="@toolwind/upgrade"
    ROOT_PKG_NAME="${PKG_NAME}-root"

    CURRENT_VERSION=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/')
    echo "Current package version: $CURRENT_VERSION"
    # Check if the version matches the -dev.N pattern
    if ! echo "$CURRENT_VERSION" | grep -qE -- '-dev\.[0-9]+$'; then \
        echo "Error: Version '$CURRENT_VERSION' does not match expected -dev.N pattern."; \
        exit 1; \
    fi
    # Extract base version and dev number
    BASE_VERSION=$(echo "$CURRENT_VERSION" | sed -E 's/(.*)-dev\.[0-9]+$/\1/')
    DEV_NUMBER=$(echo "$CURRENT_VERSION" | sed -E 's/.*-dev\.([0-9]+)$/\1/')
    NEXT_DEV_NUMBER=$((DEV_NUMBER + 1))
    NEW_VERSION="$BASE_VERSION-dev.$NEXT_DEV_NUMBER"
    echo "New package version:     $NEW_VERSION"

    # --- Update Package package.json ---
    echo "Updating $PKG_FILE..."
    cp $PKG_FILE "$PKG_FILE.bak"
    sed -i.tmp "s/\"version\":[[:space:]]*\"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" $PKG_FILE || exit 1
    rm "$PKG_FILE.tmp"
    rm "$PKG_FILE.bak"

    # --- Update Root package.json ---
    echo "Updating root $ROOT_PKG_FILE..."
    # Use jq to reliably extract current values (jq needs to be installed on the system)
    CURRENT_ROOT_VERSION=$(jq -r '.version' "$ROOT_PKG_FILE")
    CURRENT_ROOT_NAME=$(jq -r '.name' "$ROOT_PKG_FILE")
    # Check if jq succeeded and variables are not empty
    if [ -z "$CURRENT_ROOT_VERSION" ] || [ -z "$CURRENT_ROOT_NAME" ]; then
        echo "Error: Failed to extract current name or version from root package.json using jq."
        exit 1
    fi
    cp $ROOT_PKG_FILE "$ROOT_PKG_FILE.bak"
    # Use sed with # delimiter, targeting the extracted current values
    sed -i.tmp "s#\"name\":[[:space:]]*\"$CURRENT_ROOT_NAME\"#\"name\": \"$ROOT_PKG_NAME\"#" $ROOT_PKG_FILE || exit 1
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_ROOT_VERSION\"#\"version\": \"$NEW_VERSION\"#" $ROOT_PKG_FILE || exit 1
    rm "$ROOT_PKG_FILE.tmp" # sed creates two .tmp files on macOS, remove both
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Versions bumped successfully!"

# === Stable Version Bumping (Patch, Minor, Major) ===
# WARNING: These assume the current version is stable (X.Y.Z).
# WARNING: Does not perform git checks or commits!

# Bump the patch version (X.Y.Z -> X.Y.Z+1)
bump-patch:
    #!/usr/bin/env bash
    set -e # Exit immediately if a command exits with a non-zero status.

    echo "Bumping PATCH version in packages/@tailwindcss-upgrade/package.json..."
    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    ROOT_PKG_FILE="package.json"
    PKG_NAME="@toolwind/upgrade"
    ROOT_PKG_NAME="${PKG_NAME}-root"

    # Extract the base X.Y.Z part, ignoring pre-release tags like -dev.N
    BASE_VERSION=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)(-[^" ]+)?".*/\1/')
    CURRENT_VERSION_FULL=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/') # Get the full current version for replacement
    echo "Current full package version: $CURRENT_VERSION_FULL"
    echo "Base package version for bump: $BASE_VERSION"
    # Check if the extracted base version matches the X.Y.Z pattern
    if ! echo "$BASE_VERSION" | grep -qE -- '^[0-9]+\.[0-9]+\.[0-9]+$'; then \
        # Use CURRENT_VERSION_FULL in error message
        echo "Error: Version '$CURRENT_VERSION_FULL' does not contain a valid X.Y.Z base for patch bump."; \
        exit 1; \
    fi
    # Extract components from BASE_VERSION
    MAJOR=$(echo "$BASE_VERSION" | cut -d. -f1)
    MINOR=$(echo "$BASE_VERSION" | cut -d. -f2)
    PATCH=$(echo "$BASE_VERSION" | cut -d. -f3)
    NEXT_PATCH=$((PATCH + 1))
    NEW_VERSION="$MAJOR.$MINOR.$NEXT_PATCH"
    echo "New version:     $NEW_VERSION"

    # --- Update Package package.json ---
    echo "Updating $PKG_FILE..."
    cp $PKG_FILE "$PKG_FILE.bak"
    sed -i.tmp "s/\"version\":[[:space:]]*\"$CURRENT_VERSION_FULL\"/\"version\": \"$NEW_VERSION\"/" $PKG_FILE || exit 1
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
    rm "$ROOT_PKG_FILE.tmp"
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Versions bumped successfully!"

# Bump the minor version (X.Y.Z -> X.Y+1.0)
bump-minor:
    #!/usr/bin/env bash
    set -e # Exit immediately if a command exits with a non-zero status.

    echo "Bumping MINOR version in packages/@tailwindcss-upgrade/package.json..."
    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    ROOT_PKG_FILE="package.json"
    PKG_NAME="@toolwind/upgrade"
    ROOT_PKG_NAME="${PKG_NAME}-root"

    BASE_VERSION=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)(-[^" ]+)?".*/\1/')
    CURRENT_VERSION_FULL=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/')
    echo "Current full package version: $CURRENT_VERSION_FULL"
    echo "Base package version for bump: $BASE_VERSION"
    if ! echo "$BASE_VERSION" | grep -qE -- '^[0-9]+\.[0-9]+\.[0-9]+$'; then \
        # Use CURRENT_VERSION_FULL in error message
        echo "Error: Version '$CURRENT_VERSION_FULL' does not contain a valid X.Y.Z base for minor bump."; \
        exit 1; \
    fi
    MAJOR=$(echo "$BASE_VERSION" | cut -d. -f1)
    MINOR=$(echo "$BASE_VERSION" | cut -d. -f2)
    NEXT_MINOR=$((MINOR + 1))
    NEW_VERSION="$MAJOR.$NEXT_MINOR.0" # Reset patch to 0
    echo "New version:     $NEW_VERSION"

    # --- Update Package package.json ---
    echo "Updating $PKG_FILE..."
    cp $PKG_FILE "$PKG_FILE.bak"
    sed -i.tmp "s/\"version\":[[:space:]]*\"$CURRENT_VERSION_FULL\"/\"version\": \"$NEW_VERSION\"/" $PKG_FILE || exit 1
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
    rm "$ROOT_PKG_FILE.tmp"
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Versions bumped successfully!"

# Bump the major version (X.Y.Z -> X+1.0.0)
bump-major:
    #!/usr/bin/env bash
    set -e # Exit immediately if a command exits with a non-zero status.

    echo "Bumping MAJOR version in packages/@tailwindcss-upgrade/package.json..."
    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    ROOT_PKG_FILE="package.json"
    PKG_NAME="@toolwind/upgrade"
    ROOT_PKG_NAME="${PKG_NAME}-root"

    BASE_VERSION=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"([0-9]+\.[0-9]+\.[0-9]+)(-[^" ]+)?".*/\1/')
    CURRENT_VERSION_FULL=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/')
    echo "Current full package version: $CURRENT_VERSION_FULL"
    echo "Base package version for bump: $BASE_VERSION"
    if ! echo "$BASE_VERSION" | grep -qE -- '^[0-9]+\.[0-9]+\.[0-9]+$'; then \
        # Use CURRENT_VERSION_FULL in error message
        echo "Error: Version '$CURRENT_VERSION_FULL' does not contain a valid X.Y.Z base for major bump."; \
        exit 1; \
    fi
    MAJOR=$(echo "$BASE_VERSION" | cut -d. -f1)
    NEXT_MAJOR=$((MAJOR + 1))
    NEW_VERSION="$NEXT_MAJOR.0.0" # Reset minor and patch to 0
    echo "New version:     $NEW_VERSION"

    # --- Update Package package.json ---
    echo "Updating $PKG_FILE..."
    cp $PKG_FILE "$PKG_FILE.bak"
    sed -i.tmp "s/\"version\":[[:space:]]*\"$CURRENT_VERSION_FULL\"/\"version\": \"$NEW_VERSION\"/" $PKG_FILE || exit 1
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
    rm "$ROOT_PKG_FILE.tmp"
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Versions bumped successfully!"

# Set the version to its stable X.Y.Z base in both package and root package.json
# (e.g., 4.1.5-dev.21 -> 4.1.5).
# WARNING: Does not perform git checks or commits!
set-stable:
    #!/usr/bin/env bash
    set -e # Exit immediately if a command exits with a non-zero status.

    echo "Setting stable version in package.json files..."
    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    ROOT_PKG_FILE="package.json"
    PKG_NAME="@toolwind/upgrade"
    ROOT_PKG_NAME="${PKG_NAME}-root"

    # Get the full current package version first for replacement later
    CURRENT_VERSION_FULL=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/')
    # Extract the base X.Y.Z part, ignoring pre-release tags like -dev.N
    NEW_STABLE_VERSION=$(echo "$CURRENT_VERSION_FULL" | sed -E 's/([0-9]+\.[0-9]+\.[0-9]+).*/\1/')

    echo "Current full package version: $CURRENT_VERSION_FULL"
    # Check if the extracted base version is valid
    if ! echo "$NEW_STABLE_VERSION" | grep -qE -- '^[0-9]+\.[0-9]+\.[0-9]+$'; then \
        echo "Error: Version '$CURRENT_VERSION_FULL' does not contain a valid X.Y.Z base to set as stable."; \
        exit 1; \
    fi
    echo "Setting stable version to:  $NEW_STABLE_VERSION"

    # --- Update Package package.json ---
    echo "Updating $PKG_FILE..."
    cp $PKG_FILE "$PKG_FILE.bak"
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_VERSION_FULL\"#\"version\": \"$NEW_STABLE_VERSION\"#" $PKG_FILE || exit 1
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
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_ROOT_VERSION\"#\"version\": \"$NEW_STABLE_VERSION\"#" $ROOT_PKG_FILE || exit 1
    rm "$ROOT_PKG_FILE.tmp" # sed creates two .tmp files on macOS, remove both
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Versions set to stable successfully!"

# Start a dev cycle based on the current stable version.
# Takes optional argument: patch (default), minor, major
# Example: 4.1.5 -> `just start-dev` -> 4.1.6-dev.0
# Example: 4.1.5 -> `just start-dev minor` -> 4.2.0-dev.0
# WARNING: Assumes current version is stable X.Y.Z.
# WARNING: Does not perform git checks or commits!
start-dev level='patch':
    #!/usr/bin/env bash
    set -e # Exit immediately if a command exits with a non-zero status.

    echo "Starting dev cycle (level: {{level}}) in package.json files..."
    PKG_FILE="packages/@tailwindcss-upgrade/package.json"
    ROOT_PKG_FILE="package.json"
    PKG_NAME="@toolwind/upgrade"
    ROOT_PKG_NAME="${PKG_NAME}-root"

    # Get the full current package version first for replacement later
    CURRENT_VERSION=$(grep '"version":' "$PKG_FILE" | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\1/')
    echo "Current package version: $CURRENT_VERSION"

    # --- CHECK IF CURRENT VERSION IS STABLE ---
    if ! echo "$CURRENT_VERSION" | grep -qE -- '^[0-9]+\.[0-9]+\.[0-9]+$'; then \
        echo "Error: Current version '$CURRENT_VERSION' is not a stable X.Y.Z version. Cannot start dev cycle."; \
        exit 1; \
    fi

    # --- CALCULATE NEXT VERSION BASE ---
    MAJOR=$(echo "$CURRENT_VERSION" | cut -d. -f1)
    MINOR=$(echo "$CURRENT_VERSION" | cut -d. -f2)
    PATCH=$(echo "$CURRENT_VERSION" | cut -d. -f3)

    NEXT_MAJOR=$MAJOR
    NEXT_MINOR=$MINOR
    NEXT_PATCH=$PATCH

    case "{{level}}" in
        patch)
            NEXT_PATCH=$((PATCH + 1))
            ;;
        minor)
            NEXT_MINOR=$((MINOR + 1))
            NEXT_PATCH=0
            ;;
        major)
            NEXT_MAJOR=$((MAJOR + 1))
            NEXT_MINOR=0
            NEXT_PATCH=0
            ;;
        *)
            echo "Error: Invalid level argument '{{level}}'. Use 'patch', 'minor', or 'major'."
            exit 1
            ;;
    esac

    NEXT_VERSION_BASE="$NEXT_MAJOR.$NEXT_MINOR.$NEXT_PATCH"
    NEW_DEV_VERSION="${NEXT_VERSION_BASE}-dev.0"
    echo "New dev version:       $NEW_DEV_VERSION"

    # --- Update Package package.json ---
    echo "Updating $PKG_FILE..."
    cp $PKG_FILE "$PKG_FILE.bak"
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_VERSION\"#\"version\": \"$NEW_DEV_VERSION\"#" $PKG_FILE || exit 1
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
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_ROOT_VERSION\"#\"version\": \"$NEW_DEV_VERSION\"#" $ROOT_PKG_FILE || exit 1
    rm "$ROOT_PKG_FILE.tmp" # sed creates two .tmp files on macOS, remove both
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Dev cycle started successfully!"

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
    else \
        echo "Version check passed: $CURRENT_VERSION is a dev version."; \
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
    else \
        echo "Version check passed: $CURRENT_VERSION is a stable version."; \
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