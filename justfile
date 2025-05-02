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

# Publish a pre-release dev version (requires build first)
# NOTE: Ensure version is correctly bumped before running!
publish-dev: build
    @echo "Formatting @toolwind/upgrade package..."
    pnpm prettier --write packages/@tailwindcss-upgrade
    @echo "Publishing DEV version of @toolwind/upgrade..."
    pnpm publish --filter @toolwind/upgrade --tag dev --no-git-checks

# Publish a stable release version (requires build first)
# NOTE: Ensure version is correctly bumped to stable before running!
publish-stable: build
    @echo "Formatting @toolwind/upgrade package..."
    pnpm prettier --write packages/@tailwindcss-upgrade
    @echo "Publishing STABLE version of @toolwind/upgrade..."
    pnpm publish --filter @toolwind/upgrade --no-git-checks

# Placeholder for tests if added later
test:
    @echo "Running tests for @toolwind/upgrade..."
    # Assuming tests would be run via turbo if set up
    pnpm turbo test --filter='@toolwind/upgrade'

# Bump the dev version suffix (e.g., -dev.0 -> -dev.1) in the package.json
# WARNING: Does not perform git checks or commits!
bump-dev:
    #!/usr/bin/env bash
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
    sed -i.tmp "s/\"version\":[[:space:]]*\"$CURRENT_VERSION\"/\"version\": \"$NEW_VERSION\"/" $PKG_FILE
    rm "$PKG_FILE.tmp"
    rm "$PKG_FILE.bak"

    # --- Update Root package.json ---
    echo "Updating root $ROOT_PKG_FILE..."
    CURRENT_ROOT_VERSION=$(grep '"version":' "$ROOT_PKG_FILE" | head -n 1 | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\\1/')
    CURRENT_ROOT_NAME=$(grep '"name":' "$ROOT_PKG_FILE" | head -n 1 | sed -E 's/.*"name":[[:space:]]*"(.*)".*/\\1/')
    cp $ROOT_PKG_FILE "$ROOT_PKG_FILE.bak"
    # Update name (use current root name in pattern for safety)
    sed -i.tmp "s#\"name\":[[:space:]]*\"$CURRENT_ROOT_NAME\"#\"name\": \"$ROOT_PKG_NAME\"#" $ROOT_PKG_FILE
    # Update version (use current root version in pattern for safety)
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_ROOT_VERSION\"#\"version\": \"$NEW_VERSION\"#" $ROOT_PKG_FILE
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
    sed -i.tmp "s/\"version\":[[:space:]]*\"$CURRENT_VERSION_FULL\"/\"version\": \"$NEW_VERSION\"/" $PKG_FILE
    rm "$PKG_FILE.tmp"
    rm "$PKG_FILE.bak"

    # --- Update Root package.json ---
    echo "Updating root $ROOT_PKG_FILE..."
    CURRENT_ROOT_VERSION=$(grep '"version":' "$ROOT_PKG_FILE" | head -n 1 | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\\1/')
    CURRENT_ROOT_NAME=$(grep '"name":' "$ROOT_PKG_FILE" | head -n 1 | sed -E 's/.*"name":[[:space:]]*"(.*)".*/\\1/')
    cp $ROOT_PKG_FILE "$ROOT_PKG_FILE.bak"
    sed -i.tmp "s#\"name\":[[:space:]]*\"$CURRENT_ROOT_NAME\"#\"name\": \"$ROOT_PKG_NAME\"#" $ROOT_PKG_FILE
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_ROOT_VERSION\"#\"version\": \"$NEW_VERSION\"#" $ROOT_PKG_FILE
    rm "$ROOT_PKG_FILE.tmp"
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Versions bumped successfully!"

# Bump the minor version (X.Y.Z -> X.Y+1.0)
bump-minor:
    #!/usr/bin/env bash
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
    sed -i.tmp "s/\"version\":[[:space:]]*\"$CURRENT_VERSION_FULL\"/\"version\": \"$NEW_VERSION\"/" $PKG_FILE
    rm "$PKG_FILE.tmp"
    rm "$PKG_FILE.bak"

    # --- Update Root package.json ---
    echo "Updating root $ROOT_PKG_FILE..."
    CURRENT_ROOT_VERSION=$(grep '"version":' "$ROOT_PKG_FILE" | head -n 1 | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\\1/')
    CURRENT_ROOT_NAME=$(grep '"name":' "$ROOT_PKG_FILE" | head -n 1 | sed -E 's/.*"name":[[:space:]]*"(.*)".*/\\1/')
    cp $ROOT_PKG_FILE "$ROOT_PKG_FILE.bak"
    sed -i.tmp "s#\"name\":[[:space:]]*\"$CURRENT_ROOT_NAME\"#\"name\": \"$ROOT_PKG_NAME\"#" $ROOT_PKG_FILE
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_ROOT_VERSION\"#\"version\": \"$NEW_VERSION\"#" $ROOT_PKG_FILE
    rm "$ROOT_PKG_FILE.tmp"
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Versions bumped successfully!"

# Bump the major version (X.Y.Z -> X+1.0.0)
bump-major:
    #!/usr/bin/env bash
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
    sed -i.tmp "s/\"version\":[[:space:]]*\"$CURRENT_VERSION_FULL\"/\"version\": \"$NEW_VERSION\"/" $PKG_FILE
    rm "$PKG_FILE.tmp"
    rm "$PKG_FILE.bak"

    # --- Update Root package.json ---
    echo "Updating root $ROOT_PKG_FILE..."
    CURRENT_ROOT_VERSION=$(grep '"version":' "$ROOT_PKG_FILE" | head -n 1 | sed -E 's/.*"version":[[:space:]]*"(.*)".*/\\1/')
    CURRENT_ROOT_NAME=$(grep '"name":' "$ROOT_PKG_FILE" | head -n 1 | sed -E 's/.*"name":[[:space:]]*"(.*)".*/\\1/')
    cp $ROOT_PKG_FILE "$ROOT_PKG_FILE.bak"
    sed -i.tmp "s#\"name\":[[:space:]]*\"$CURRENT_ROOT_NAME\"#\"name\": \"$ROOT_PKG_NAME\"#" $ROOT_PKG_FILE
    sed -i.tmp "s#\"version\":[[:space:]]*\"$CURRENT_ROOT_VERSION\"#\"version\": \"$NEW_VERSION\"#" $ROOT_PKG_FILE
    rm "$ROOT_PKG_FILE.tmp"
    rm "$ROOT_PKG_FILE.tmp" 2>/dev/null || true
    rm "$ROOT_PKG_FILE.bak"

    echo "Versions bumped successfully!" 