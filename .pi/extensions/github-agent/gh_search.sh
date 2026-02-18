#!/bin/bash

# gh_search.sh
# GitHub API search wrapper using gh cli

TYPE="code"
LIMIT=5
REPO=""
EXTENSION=""
QUERY=""

# Parse arguments
while [[ "$#" -gt 0 ]]; do
    case $1 in
        -t|--type) TYPE="$2"; shift ;;
        -l|--limit) LIMIT="$2"; shift ;;
        -r|--repo) REPO="$2"; shift ;;
        -e|--extension) EXTENSION="$2"; shift ;;
        *) QUERY="$QUERY $1" ;;
    esac
    shift
done

# Trim leading space from query
QUERY="${QUERY## }"

if [ -z "$QUERY" ]; then
    echo "Usage: $0 <query> [-t type] [-l limit] [-r repo] [-e extension]"
    echo "Example: $0 'search logic' -t code -e ts"
    exit 1
fi

# Build query string
Q="$QUERY"

# Add modifiers based on type
if [ "$TYPE" == "code" ]; then
    if [ -n "$EXTENSION" ]; then
        Q="$Q extension:$EXTENSION"
    fi
    
    if [ -n "$REPO" ]; then
        Q="$Q repo:$REPO"
    elif [[ "$Q" != *"repo:"* ]]; then
        # If repo is not specified for code search, append placeholder for current repo
        Q="$Q repo:{owner}/{repo}"
    fi
elif [ -n "$REPO" ]; then
    Q="$Q repo:$REPO"
fi

echo "Searching $TYPE for: '$Q' (Limit: $LIMIT)..." >&2

# Execute gh api
# We use a custom jq filter to present results nicely
gh api -X GET "search/$TYPE" \
    -H "Accept: application/vnd.github.v3.text-match+json" \
    -F q="$Q" \
    -F per_page="$LIMIT" \
    --jq '.items[] | "[\(.repository.full_name // "current")] \(.path // .html_url)\n  Match: \(.text_matches[0].fragment // .body // .description // "" | gsub("\n"; " ") | .[0:150])...\n"'
