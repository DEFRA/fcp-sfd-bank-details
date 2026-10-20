---
name: create-jira-ticket
description: Create a Jira ticket in the FLS2 project with optional epic linking. Use when asked to create a Jira ticket directly or when create-pr needs to create one.
argument-hint: "[Task|Story|Bug] [summary] [optional-epic-keyword]"
---

# Create Jira ticket

Create a new Jira issue in the FLS2 project and return the ticket key for branch and PR naming.

## Scope

- FLS2 project only
- New issue creation only (no transitions, bulk updates, or workflow changes)

## Prerequisites (first-time setup)

The Jira workflow needs three values. The API token is a secret and should never be stored in the repo.

- **`JIRA_TOKEN`** — provide via secure storage or environment variable. Generate a token at https://id.atlassian.com/manage-profile/security/api-tokens, then:
  - **macOS (recommended):** Store in Keychain and export at runtime
    ```bash
    security add-generic-password -a "$USER" -s jira-api-token -w '<your-token>' -U
    export JIRA_TOKEN=$(security find-generic-password -a "$USER" -s jira-api-token -w)
    ```
  - **Cross-platform fallback:** Set as an environment variable
    ```bash
    export JIRA_TOKEN='<your-token>'
    ```
- **`JIRA_BASE_URL`** — defaults to `https://eaflood.atlassian.net`.
- **`JIRA_EMAIL`** — your Defra email. Set it in your personal user instructions rather than here, since this skill is shared.

Before any Jira call, apply the default and fail loudly if anything required is still missing:

```bash
: "${JIRA_BASE_URL:=https://eaflood.atlassian.net}"
: "${JIRA_EMAIL:?JIRA_EMAIL not set — see your personal user instructions}"
: "${JIRA_TOKEN:?JIRA_TOKEN not set — set via Keychain (macOS: security add-generic-password -a \$USER -s jira-api-token -w '<token>' -U) or export JIRA_TOKEN='<token>'}"
```

Never commit credentials to the repo.

## Step 1: Gather ticket input

Collect these values before creating the issue:

- Issue type (`Task`, `Story`, or `Bug`)
- Ticket summary
- One-paragraph description of what changed and why
- One or more change bullets
- Optional epic keyword

## Step 2: Find epic by keyword (optional)

Search for an epic by keyword rather than guessing, using `/rest/api/3/search/jql`.

```bash
KEYWORD=$(cat <<'EOF'
<keyword>
EOF
)
JQL="project = FLS2 AND issuetype = Epic AND summary ~ \"$KEYWORD\""
curl -s -G "$JIRA_BASE_URL/rest/api/3/search/jql" \
  -H "Authorization: Basic $(printf '%s' "$JIRA_EMAIL:$JIRA_TOKEN" | base64 | tr -d '\n')" \
  --data-urlencode "jql=$JQL" \
  --data-urlencode 'fields=summary'
```

If multiple epics match, show candidates and ask the user which one to use. If none match, proceed without a parent link.

## Step 3: Build a safe payload

Never splice generated titles or descriptions directly into JSON literals. Use quoted heredocs and `jq --arg` for safe escaping.

```bash
SUMMARY=$(cat <<'EOF'
<ticket title>
EOF
)
DESCRIPTION=$(cat <<'EOF'
<one-paragraph summary of what this change does and why>
EOF
)
ISSUE_TYPE='<Task|Story|Bug>'
EPIC_KEY='<epic key, leave empty if none>'
BULLETS=('<change bullet>')
BULLETS_JSON=$(printf '%s\n' "${BULLETS[@]}" | jq -R . | jq -s .)

PAYLOAD=$(jq -n \
  --arg summary "$SUMMARY" \
  --arg text "$DESCRIPTION" \
  --arg issuetype "$ISSUE_TYPE" \
  --arg epic "$EPIC_KEY" \
  --argjson bullets "$BULLETS_JSON" \
  '{
    fields: (
      {
        project: { key: "FLS2" },
        summary: $summary,
        description: {
          type: "doc",
          version: 1,
          content: [
            { type: "paragraph", content: [{ type: "text", text: $text }] },
            { type: "bulletList", content: [
              $bullets[] | { type: "listItem", content: [
                { type: "paragraph", content: [{ type: "text", text: . }] }
              ] }
            ] }
          ]
        },
        issuetype: { name: $issuetype }
      }
      + (if $epic == "" then {} else { parent: { key: $epic } } end)
    )
  }')
```

Build `BULLETS` from real change bullets and never send an empty list.

## Step 4: Create the issue

Use Jira REST API v3 with Basic auth.

```bash
curl -s -X POST "$JIRA_BASE_URL/rest/api/3/issue" \
  -H "Authorization: Basic $(printf '%s' "$JIRA_EMAIL:$JIRA_TOKEN" | base64 | tr -d '\n')" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD"
```

## Step 5: Return result to caller

Return the new ticket key and URL so callers can continue PR naming and linking.

Expected output fields:

- `ticketKey` (for example `FLS2-42`)
- `ticketUrl` (for example `https://eaflood.atlassian.net/browse/FLS2-42`)

## Rules

- Do not run Jira calls if env vars are missing.
- Never print or store secrets.
