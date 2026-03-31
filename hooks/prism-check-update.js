#!/usr/bin/env node
// prism-check-update.js — SessionStart hook for Prism auto-update
// Spawns a background process to git fetch and check if the skill is behind origin/main.
// Writes result to ~/.claude/cache/prism-update-check.json for SKILL.md to read.
// Never modifies the repo — check-and-notify only.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const homeDir = os.homedir();

// Find the Prism skill directory across config dirs
function findSkillDir() {
  const envDir = process.env.CLAUDE_CONFIG_DIR;
  const candidates = [
    ...(envDir ? [envDir] : []),
    path.join(homeDir, '.claude'),
    path.join(homeDir, '.config', 'opencode'),
    path.join(homeDir, '.opencode'),
    path.join(homeDir, '.gemini')
  ];
  for (const dir of candidates) {
    const skillPath = path.join(dir, 'skills', 'prism');
    if (fs.existsSync(path.join(skillPath, 'VERSION'))) {
      return skillPath;
    }
  }
  return null;
}

const skillDir = findSkillDir();
const cacheDir = path.join(homeDir, '.claude', 'cache');
const cacheFile = path.join(cacheDir, 'prism-update-check.json');

// Ensure cache directory exists
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// TTL guard — skip if checked within the last hour
try {
  const cached = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  const age = Math.floor(Date.now() / 1000) - (cached.checked || 0);
  if (age < 3600) process.exit(0);
} catch (e) { /* no cache or parse error — proceed */ }

if (!skillDir) {
  fs.writeFileSync(cacheFile, JSON.stringify({
    status: 'NOT_FOUND',
    checked: Math.floor(Date.now() / 1000)
  }));
  process.exit(0);
}

// Spawn detached background child to do the actual git work
const child = spawn(process.execPath, ['-e', `
  const fs = require('fs');
  const { execSync } = require('child_process');

  const skillDir = ${JSON.stringify(skillDir)};
  const cacheFile = ${JSON.stringify(cacheFile)};
  const now = Math.floor(Date.now() / 1000);

  function write(data) {
    fs.writeFileSync(cacheFile, JSON.stringify({ ...data, checked: now }));
  }

  // 1. Confirm git repo
  try {
    execSync('git rev-parse --git-dir', { cwd: skillDir, stdio: 'ignore', timeout: 5000 });
  } catch (e) {
    write({ status: 'NOT_GIT' });
    process.exit(0);
  }

  // 2. Check for dirty tracked files (untracked files are OK)
  try {
    const porcelain = execSync('git status --porcelain', {
      cwd: skillDir, encoding: 'utf8', timeout: 5000
    });
    const dirty = porcelain.split('\\n').filter(l => l && !l.startsWith('??'));
    if (dirty.length > 0) {
      write({ status: 'DIRTY' });
      process.exit(0);
    }
  } catch (e) {}

  // 3. Read installed version
  let installed = 'unknown';
  try {
    installed = fs.readFileSync(skillDir + '/VERSION', 'utf8').trim();
  } catch (e) {}

  // 4. Fetch from origin
  try {
    execSync('git fetch origin --quiet', {
      cwd: skillDir, stdio: 'ignore', timeout: 15000
    });
  } catch (e) {
    write({ status: 'FETCH_FAILED', installed });
    process.exit(0);
  }

  // 5. Count commits behind origin/main
  let behind = 0;
  try {
    behind = parseInt(
      execSync('git rev-list HEAD..origin/main --count', {
        cwd: skillDir, encoding: 'utf8', timeout: 5000
      }).trim(), 10
    ) || 0;
  } catch (e) {
    write({ status: 'FETCH_FAILED', installed });
    process.exit(0);
  }

  if (behind === 0) {
    write({ status: 'UP_TO_DATE', installed, commits_behind: 0 });
    process.exit(0);
  }

  // 6. Read latest version from origin without pulling
  let latest = 'unknown';
  try {
    latest = execSync('git show origin/main:VERSION', {
      cwd: skillDir, encoding: 'utf8', timeout: 5000
    }).trim();
  } catch (e) {}

  write({
    status: 'UPDATE_AVAILABLE',
    installed,
    latest,
    commits_behind: behind
  });
`], {
  stdio: 'ignore',
  windowsHide: true,
  detached: true
});

child.unref();
