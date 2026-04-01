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
| `google` | `prism-google` | `GOOGLE_API_KEY` |
| `stitch` | `prism-stitch` | `STITCH_API_KEY` |

Only these provider names are accepted. Reject anything else with:
"Unknown provider. Supported: anthropic, openai, google, vercel, stripe, stitch."

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
These are Prism chat commands, not standalone shell binaries. Prism may ask the user to run a
shell command in their terminal as part of the flow.

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
security show-keychain-info login.keychain 2>&1 | grep -v "unlocked" | grep -q "locked" && echo "KEYCHAIN_LOCKED" || echo "KEYCHAIN_OK"
```

If KEYCHAIN_LOCKED: "Your keychain is locked. Unlock it and try again."

If KEYCHAIN_OK, check each provider (no -w flag, no secret exposed):

```bash
for p in anthropic openai google vercel stripe stitch; do
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

## Stitch Availability Note

Stitch has two readiness modes:

1. **Host-managed Stitch**: the active runtime already exposes Stitch MCP tools.
2. **Repo-managed Stitch**: the local proxy reads the key from macOS Keychain.

`prism: connect stitch` and `prism: status` only affect the repo-managed path. Prism may still be
able to use Stitch through host-managed MCP tools even when the local proxy is not ready.

### prism: inject

Writes connected keys to `.env.local` in the project directory. Secrets never enter
the LLM context window.

**Auto-injection at Stage 0:** Inject now runs automatically at session start via
`scripts/prism-inject.sh`. The agent reads the JSON output and surfaces warnings
only when needed (conflicts, errors, or first-session tip for new users).

**Manual re-injection:** `prism: inject` is still available for manual use. For
monorepo projects where `.env.local` should go in a subdirectory, run manually:
`bash scripts/prism-inject.sh <target_dir>`.

**Reference implementation:** See `scripts/prism-inject.sh` for the live version.
The script handles:
- .gitignore verification before any secret touches disk
- Conflict detection (project-local values win, conflicting providers are skipped)
- Corrupt block detection (start marker without end marker)
- Idempotency (skips write if .env.local content is unchanged)
- Atomic write (original .env.local preserved on failure)
- JSON output to temp file, one-line summary to stdout

**Conflict behavior:** If an env var (e.g., `ANTHROPIC_API_KEY`) already exists in
`.env.local` outside the prism-managed block, that provider is skipped. Project-local
values always win. The JSON output includes a `conflicts` array listing skipped vars.

If `status: "ok"`: "Keys injected to .env.local ({N} providers)."
If `status: "skip", reason: "no_keys"`: "No connected providers found. Run `prism: connect <provider>` first."
If `status: "error", reason: "corrupt_block"`: "The prism-managed block in .env.local is corrupted (missing end marker). Fix manually or delete the block and re-inject."
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
