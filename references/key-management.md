# Key Management — Central API Key Vault

Prism stores API keys in the macOS Keychain so users connect each service once and
every project gets the keys automatically. Zero copy-paste after initial setup.

## Supported Providers

| Provider | Keychain service name | Env var written |
|----------|-----------------------|-----------------|
| `anthropic` | `prism-anthropic` | `ANTHROPIC_API_KEY` |
| `openai` | `prism-openai` | `OPENAI_API_KEY` |
| `vercel` | `prism-vercel` | `VERCEL_TOKEN` |
| `stripe` | `prism-stripe` | `STRIPE_SECRET_KEY` |

Only these provider names are accepted. Reject anything else with:
"Unknown provider. Supported: anthropic, openai, vercel, stripe."

## Credential Precedence

1. **macOS Keychain** (`prism-<provider>`) — primary, injected to .env.local
2. **Environment variable** (ANTHROPIC_API_KEY etc) — server-side, existing pattern
3. **localStorage** — legacy web-app-only, existing pattern

## OS Detection

Run at Stage 0 before any key operations:

```bash
[ "$(uname)" = "Darwin" ] && command -v security >/dev/null 2>&1 && echo "KEYCHAIN_AVAILABLE" || echo "KEYCHAIN_UNAVAILABLE"
```

If unavailable: "Key vault requires macOS. You can set API keys manually via
environment variables."

## Commands

All commands use the `prism:` prefix to avoid false positives in the 40KB SKILL.md.

### prism: connect <provider>

The agent NEVER executes commands containing secrets. It prints the template for the
user to run in their own terminal.

**Agent output:**

```
Run this command in your terminal (paste your key where indicated):

  security add-generic-password -s "prism-{provider}" -a "prism" -w "YOUR_KEY_HERE" -U -T /usr/bin/security
```

After the user confirms they ran it, verify (no -w flag, no secret exposed):

```bash
security find-generic-password -s "prism-{provider}" -a "prism" 2>/dev/null && echo "CONNECTED" || echo "NOT_FOUND"
```

If CONNECTED: "Connected {provider}. Your key is stored in the macOS Keychain."
If NOT_FOUND: "Key not found. Make sure you ran the command and replaced YOUR_KEY_HERE with your actual key."

### prism: disconnect <provider>

```bash
security delete-generic-password -s "prism-{provider}" -a "prism" 2>&1
```

Confirm: "Disconnected {provider}. Key removed from keychain."

### prism: status

For each supported provider, check existence (no -w flag, no secret exposed):

```bash
for p in anthropic openai vercel stripe; do
  security find-generic-password -s "prism-$p" -a "prism" 2>/dev/null && echo "$p: connected" || echo "$p: not connected"
done
```

Display as a clean list:
```
  anthropic: connected
  openai: connected
  vercel: not connected
  stripe: not connected
```

### prism: inject

Writes connected keys to `.env.local` in the project root. Secrets never enter the
LLM context window. The entire inject runs as ONE Bash command.

**Step 1: Verify .gitignore BEFORE any secret touches disk**

```bash
grep -qxF '.env.local' .gitignore 2>/dev/null || echo '.env.local' >> .gitignore
```

**Step 2: Build and write via single pipeline**

```bash
# Provider-to-env-var mapping
declare -A ENV_VAR=(
  [anthropic]="ANTHROPIC_API_KEY"
  [openai]="OPENAI_API_KEY"
  [vercel]="VERCEL_TOKEN"
  [stripe]="STRIPE_SECRET_KEY"
)

# Build the prism-managed block in a temp file
TMPFILE=$(mktemp /tmp/prism-env-XXXXXX)
echo "# --- prism-managed:start ---" > "$TMPFILE"
for provider in anthropic openai vercel stripe; do
  KEY=$(security find-generic-password -s "prism-$provider" -a "prism" -w 2>/dev/null) && \
  echo "${ENV_VAR[$provider]}=$KEY" >> "$TMPFILE"
done
echo "# --- prism-managed:end ---" >> "$TMPFILE"

# Merge: strip old prism block from .env.local, append new block, atomic mv
MERGED=$(mktemp /tmp/prism-merged-XXXXXX)
if [ -f .env.local ]; then
  sed '/# --- prism-managed:start ---/,/# --- prism-managed:end ---/d' .env.local > "$MERGED"
else
  touch "$MERGED"
fi
cat "$TMPFILE" >> "$MERGED"
mv "$MERGED" .env.local
rm -f "$TMPFILE"
echo "INJECT_COMPLETE"
```

**IMPORTANT:** This entire block runs as ONE Bash command via the Bash tool. The agent
sees only "INJECT_COMPLETE" or an error. Keys are never in the LLM context.

If INJECT_COMPLETE: "Keys injected to .env.local."
If error: Surface the error in plain English.

## Error Handling

| Error | Detection | Recovery |
|-------|-----------|----------|
| Keychain locked | `security` returns `errSecInteractionNotAllowed` | "Your keychain is locked. Unlock it (enter your Mac password) and try again." |
| Key not found on disconnect | `security delete` fails | "No key found for {provider}. Nothing to disconnect." |
| .env.local merge conflict | Shouldn't happen with block rewrite | Old block is fully replaced. User keys outside the block are preserved. |
| `security` CLI missing | OS detection gate returns UNAVAILABLE | "Key vault requires macOS." |

## Security Model

- Secrets at rest: protected by macOS Keychain (AES-256, unlocked at login)
- Secrets in transit: pass through shell stdout only during inject, written directly to file
- Secrets in LLM context: NEVER. Agent prints templates, never executes with -w flag. Inject is a single pipeline.
- .env.local: must be gitignored. Agent verifies before every inject.
- The `-T /usr/bin/security` flag allows the security binary to access items without GUI prompts.
