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

First check if the keychain is accessible:

```bash
security show-keychain-info login.keychain 2>&1 | grep -q "locked" && echo "KEYCHAIN_LOCKED" || echo "KEYCHAIN_OK"
```

If KEYCHAIN_LOCKED: "Your keychain is locked. Unlock it and try again."

If KEYCHAIN_OK, check each provider (no -w flag, no secret exposed):

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

Writes connected keys to `.env.local` in the project directory. Secrets never enter
the LLM context window. The entire inject runs as ONE Bash command.

**Step 0: Detect target directory**

The agent determines where `.env.local` should go. For monorepos or projects where
the app lives in a subdirectory (e.g., `app/`), inject into the app subdirectory
where the framework reads env files. Default: project root.

**Step 1: Verify .gitignore BEFORE any secret touches disk**

```bash
TARGET_DIR="${TARGET_DIR:-.}"
grep -qxF '.env.local' "$TARGET_DIR/.gitignore" 2>/dev/null || echo '.env.local' >> "$TARGET_DIR/.gitignore"
```

**Step 2: Build and write via single pipeline**

```bash
# Map provider to env var (bash 3.2 compatible — no associative arrays)
env_var_for() {
  case "$1" in
    anthropic) echo "ANTHROPIC_API_KEY" ;;
    openai)    echo "OPENAI_API_KEY" ;;
    vercel)    echo "VERCEL_TOKEN" ;;
    stripe)    echo "STRIPE_SECRET_KEY" ;;
  esac
}

# Trap to clean up temp files on any exit
TMPFILE=$(mktemp /tmp/prism-env-XXXXXX)
MERGED=$(mktemp /tmp/prism-merged-XXXXXX)
trap 'rm -f "$TMPFILE" "$MERGED"' EXIT

# Build the prism-managed block
INJECTED=0
echo "# --- prism-managed:start ---" > "$TMPFILE"
for provider in anthropic openai vercel stripe; do
  KEY=$(security find-generic-password -s "prism-$provider" -a "prism" -w 2>/dev/null) && {
    printf '%s=%s\n' "$(env_var_for "$provider")" "$KEY" >> "$TMPFILE"
    INJECTED=$((INJECTED + 1))
  }
done
echo "# --- prism-managed:end ---" >> "$TMPFILE"

if [ "$INJECTED" -eq 0 ]; then
  echo "NO_KEYS_FOUND"
  exit 0
fi

# Merge: strip old prism block from .env.local, append new block, atomic mv
ENV_FILE="$TARGET_DIR/.env.local"
if [ -f "$ENV_FILE" ]; then
  # Validate end marker exists before sed (prevents deleting to EOF)
  if grep -q '# --- prism-managed:start ---' "$ENV_FILE" && ! grep -q '# --- prism-managed:end ---' "$ENV_FILE"; then
    echo "CORRUPT_BLOCK"
    exit 1
  fi
  sed '/# --- prism-managed:start ---/,/# --- prism-managed:end ---/d' "$ENV_FILE" > "$MERGED"
else
  touch "$MERGED"
fi
cat "$TMPFILE" >> "$MERGED"
mv "$MERGED" "$ENV_FILE"
echo "INJECT_COMPLETE: $INJECTED keys"
```

**IMPORTANT:** This entire block runs as ONE Bash command via the Bash tool. The agent
sees only "INJECT_COMPLETE: N keys", "NO_KEYS_FOUND", or "CORRUPT_BLOCK". Keys are
never in the LLM context.

If INJECT_COMPLETE: "Keys injected to .env.local ({N} providers)."
If NO_KEYS_FOUND: "No connected providers found. Run `prism: connect <provider>` first."
If CORRUPT_BLOCK: "The prism-managed block in .env.local is corrupted (missing end marker). Fix manually or delete the block and re-inject."
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
