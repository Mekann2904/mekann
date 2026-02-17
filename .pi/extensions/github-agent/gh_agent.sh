#!/bin/bash

# gh_agent.sh - GitHub Agent Tool
# A multi-purpose GitHub CLI wrapper designed for AI Agents to explore repositories.
#
# Usage:
#   ./gh_agent.sh <command> [args...]
#
# Commands:
#   info <repo>             Show repository summary (description, languages, stats)
#   tree <repo> [path]      List files in a repository (limit 50 by default)
#   read <repo> <path>      Read file content (Base64 decoded)
#   search <query>          Search code, issues, or repositories
#
# Options:
#   -t, --type <type>       Search type: code (default), issues, repositories
#   -r, --repo <repo>       Target repository (required for code search unless query has repo:)
#   -l, --limit <num>       Max results (default: 5)
#   -e, --ext <ext>         File extension filter (code search only)

function show_help {
    grep "^# " "$0" | cut -c 3-
}

if [ $# -eq 0 ]; then
    show_help
    exit 1
fi

COMMAND=$1
shift

case "$COMMAND" in
    info)
        REPO=$1
        if [ -z "$REPO" ]; then echo "Error: Repo required"; exit 1; fi
        
        gh api "repos/$REPO" --jq '"# \(.full_name)\nDescription: \(.description)\nStars: \(.stargazers_count) | Forks: \(.forks_count) | Issues: \(.open_issues_count)\nLanguage: \(.language)\nDefault Branch: \(.default_branch)\nHTML URL: \(.html_url)\n"'
        ;;

    tree)
        REPO=$1
        PATH_PREFIX=${2:-""}
        # LIMIT=${3:-50} # Removed limit argument, just output all (head handled by caller if needed)

        if [ -z "$REPO" ]; then echo "Error: Repo required"; exit 1; fi
        
        # Get default branch sha first, or just use HEAD
        # recursive=1 gets all files. filter by path prefix if provided.
        gh api "repos/$REPO/git/trees/HEAD?recursive=1" --jq ".tree[] | select(.path | startswith(\"$PATH_PREFIX\")) | \"\(.type)\t\(.path)\"" | \
        awk '{
            if ($1 == "tree") print "📂 " $2;
            else if ($1 == "blob") print "📄 " $2;
        }'
        ;;

    read)
        REPO=$1
        FILE_PATH=$2
        
        if [ -z "$REPO" ] || [ -z "$FILE_PATH" ]; then echo "Error: Repo and File path required"; exit 1; fi
        
        # Check file size first to avoid large files? For now, just try read.
        CONTENT=$(gh api "repos/$REPO/contents/$FILE_PATH" --jq '.content' 2>/dev/null)
        
        if [ -z "$CONTENT" ]; then
            echo "Error: Could not read file '$FILE_PATH' from '$REPO' (maybe too large or not found?)" >&2
            exit 1
        fi
        
        # base64 decode (ignore garbage to be safe)
        echo "$CONTENT" | base64 -d
        ;;

    search)
        TYPE="code"
        LIMIT=5
        REPO=""
        EXTENSION=""
        QUERY=""

        while [[ "$#" -gt 0 ]]; do
            case $1 in
                -t|--type) TYPE="$2"; shift ;;
                -l|--limit) LIMIT="$2"; shift ;;
                -r|--repo) REPO="$2"; shift ;;
                -e|--ext) EXTENSION="$2"; shift ;;
                *) QUERY="$QUERY $1" ;;
            esac
            shift
        done
        
        # Trim leading space
        QUERY="${QUERY## }"
        
        # Build Query
        Q="$QUERY"
        if [ "$TYPE" == "code" ]; then
            if [ -n "$EXTENSION" ]; then Q="$Q extension:$EXTENSION"; fi
            
            # Repo logic
            if [ -n "$REPO" ]; then
                Q="$Q repo:$REPO"
            elif [[ "$Q" != *"repo:"* ]]; then
                 # If repo is not specified for code search, try to use current repo if in git dir
                 # But since this is a general tool, maybe just warn?
                 # gh api requires repo or user context usually.
                 # Let's try to get current repo if possible
                 CURRENT_REPO=$(gh repo view --json nameWithOwner --jq .nameWithOwner 2>/dev/null)
                 if [ -n "$CURRENT_REPO" ]; then
                     Q="$Q repo:$CURRENT_REPO"
                 else
                     echo "Warning: Code search usually requires a repository scope (repo:owner/name)." >&2
                 fi
            fi
        elif [ -n "$REPO" ]; then
            Q="$Q repo:$REPO"
        fi
        
        # echo "Searching $TYPE for '$Q'..." >&2
        
        gh api -X GET "search/$TYPE" \
            -H "Accept: application/vnd.github.v3.text-match+json" \
            -F q="$Q" \
            -F per_page="$LIMIT" \
            --jq '.items[] | "[\(.repository.full_name // "current")] \(.path // .html_url)\nMatch: \(.text_matches[0].fragment // .body // .description // "" | gsub("\n"; " ") | .[0:200])...\n"'
        ;;

    *)
        show_help
        exit 1
        ;;
esac
