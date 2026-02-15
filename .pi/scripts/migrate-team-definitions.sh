#!/bin/bash
# Agent Team Definitions Migration Script
# Flat structure -> Team-based folder structure

set -e

DEFINITIONS_DIR="/Users/mekann/github/pi-plugin/mekann/.pi/agent-teams/definitions"
DRY_RUN="${DRY_RUN:-true}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_dry() {
  echo -e "[DRY-RUN] $1"
}

# Extract team name from filename
# core-delivery-team.md -> core-delivery
# core-delivery-p1.md -> core-delivery
# template-team.md -> _templates
extract_team_name() {
  local filename="$1"

  # Template files
  if [[ "$filename" =~ ^template ]]; then
    echo "_templates"
    return
  fi

  # Remove suffixes
  local name=$(echo "$filename" | sed -E 's/-team\.md$//' | sed -E 's/-p[0-9]\.md$//' | sed -E 's/\.md$//')

  echo "$name"
}

# Check if this is a main team file (no suffix like -team or -pN)
is_main_team_file() {
  local filename="$1"

  # Exclude template files
  if [[ "$filename" =~ ^template ]]; then
    return 1
  fi

  # Has -team.md suffix -> not main
  if [[ "$filename" =~ -team\.md$ ]]; then
    return 1
  fi

  # Has -pN.md suffix -> not main
  if [[ "$filename" =~ -p[0-9]\.md$ ]]; then
    return 1
  fi

  # Just .md -> main team file
  if [[ "$filename" =~ \.md$ ]]; then
    return 0
  fi

  return 1
}

# Get new filename
get_new_filename() {
  local filename="$1"

  if [[ "$filename" =~ ^template ]]; then
    if [[ "$filename" == "template-team.md" ]]; then
      echo "team-guide.md"
    elif [[ "$filename" =~ ^template-p([0-9])\.md$ ]]; then
      echo "p${BASH_REMATCH[1]}.md"
    else
      echo "$filename"
    fi
  else
    if [[ "$filename" =~ -team\.md$ ]]; then
      echo "team.md"
    elif [[ "$filename" =~ -p([0-9])\.md$ ]]; then
      echo "p${BASH_REMATCH[1]}.md"
    elif is_main_team_file "$filename"; then
      echo "team.md"
    else
      echo "$filename"
    fi
  fi
}

# Main migration logic
migrate() {
  log_info "Starting migration..."
  log_info "Source: $DEFINITIONS_DIR"
  log_info "Mode: $([ "$DRY_RUN" = "true" ] && echo "DRY-RUN" || echo "EXECUTE")"
  echo ""

  # Collect all .md files
  local files=$(find "$DEFINITIONS_DIR" -maxdepth 1 -name "*.md" -type f | sort)

  if [ -z "$files" ]; then
    log_warn "No .md files found in definitions directory"
    exit 0
  fi

  local file_count=$(echo "$files" | wc -l | tr -d ' ')
  log_info "Found $file_count files to migrate"
  echo ""

  # Collect unique team names
  local team_names=""
  for filepath in $files; do
    local filename=$(basename "$filepath")
    local team=$(extract_team_name "$filename")
    if ! echo "$team_names" | grep -q "$team"; then
      team_names="$team_names $team"
    fi
  done

  echo "=== Migration Plan ==="
  echo ""

  for filepath in $files; do
    local filename=$(basename "$filepath")
    local team=$(extract_team_name "$filename")
    local new_filename=$(get_new_filename "$filename")
    printf "  %-40s -> %-15s/%s\n" "$filename" "$team" "$new_filename"
  done

  echo ""
  echo "=== Folders to Create ==="
  echo ""

  for team in $team_names; do
    echo "  $DEFINITIONS_DIR/$team/"
  done

  echo ""

  if [ "$DRY_RUN" = "true" ]; then
    echo ""
    log_warn "DRY-RUN MODE: No changes will be made"
    log_info "To execute, run: DRY_RUN=false $0"
    exit 0
  fi

  # Confirm before proceeding
  echo ""
  read -p "Proceed with migration? (y/N) " -n 1 -r
  echo ""

  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    log_warn "Migration cancelled"
    exit 0
  fi

  # Create folders
  for team in $team_names; do
    mkdir -p "$DEFINITIONS_DIR/$team"
    log_info "Created folder: $team"
  done

  # Move files
  for filepath in $files; do
    local filename=$(basename "$filepath")
    local team=$(extract_team_name "$filename")
    local new_filename=$(get_new_filename "$filename")
    local new_path="$DEFINITIONS_DIR/$team/$new_filename"

    mv "$filepath" "$new_path"
    log_info "Moved: $filename -> $team/$new_filename"
  done

  echo ""
  log_info "Migration completed!"
  log_info "Verify the structure with: ls -laR $DEFINITIONS_DIR"
}

# Run
migrate
