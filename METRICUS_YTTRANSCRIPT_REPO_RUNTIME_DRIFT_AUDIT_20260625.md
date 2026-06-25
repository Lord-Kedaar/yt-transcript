# ytTranscript — repo/runtime drift audit

**Date:** 2026-06-25  
**Scope:** Mac repo `/Users/radek/Documents/Projects/yt-transcript` vs Lenovo production `/srv/storage/AI_Projects/yt-transcript`  
**Mode:** read-only audit + cleanup phase 1. Production cleanup not performed in this pass; Mac audit branch import performed after baseline.

**Cleanup phase 1 status (2026-06-25):** created branch `audit/import-lenovo-production-20260625`, copied Lenovo runtime files into Mac working tree (`server.js`, root `index.html`, `package.json`, `package-lock.json`, `.env.example`, `DEPLOYMENT_LENOVO_LINUX.md`) and stored raw remote snapshot under `.audit/lenovo-snapshot-20260625/`. Validation: `node --check server.js` OK; client tests OK; `npm run build` OK; local server on `PORT=4500` returned `GET /` 200, `GET /api/health` 200, TTS valid `type:"reconstruction"` returned audio URL and audio file 200 `audio/wav`.

---

## Executive summary

ytTranscript currently has two diverged code surfaces:

1. **Mac git repo (`main`, HEAD `ded7006`)** — git-managed source tree. Its server serves `client/dist/index.html`; `client/src` builds through Vite; `client/dist` is ignored and not tracked.
2. **Lenovo production (`/srv/storage/AI_Projects/yt-transcript`)** — not a git repo because `/srv/storage` hits an NFS filesystem boundary. The running Node process serves root `index.html`; production `server.js` contains runtime-only features not present on Mac `main`.

The production bug fixed earlier (`Invalid audio source. Use reconstruction or summary.`) was caused by code that exists on Lenovo production, not in Mac `main`. Therefore Mac-only `git grep` is insufficient for runtime bugs.

**Highest-risk finding:** production source of truth is not version-controlled. Lenovo has functional changes (+409/-46 in `server.js` vs Mac) and a 2643-line root `index.html` that are not represented as tracked source in the Mac repo.

---

## Evidence snapshot

### Mac repo

```text
Path: /Users/radek/Documents/Projects/yt-transcript
Branch: main
HEAD: ded7006 docs: remove internal OpenCode prompts from public repo
Git status:
?? DEPLOYMENT_LENOVO_LINUX.md
?? METRICUS_YTTRANSCRIPT_DESKTOP_DEMO_MODAL_DEPLOYMENT_VERIFICATION_REPORT.md
?? METRICUS_YTTRANSCRIPT_DESKTOP_DEMO_MODAL_FIX_REPORT.md
?? YTTRANSCRIPT_DEMO_LIMIT_AND_LENOVO_DEPLOY_REPORT.md
?? YTTRANSCRIPT_PIPER_LAYOUT_AUDIO_QA_READINESS_REPORT.md
?? backups/
```

Key Mac facts:

```text
server.js INDEX_HTML_PATH = path.join(__dirname, 'client', 'dist', 'index.html')
server.js routes: /api/build-version, /api/health, /api/lm-status, /api/transcript,
                  /api/transform, /, /api/tts, /api/audio/:id
No root index.html exists.
client/src/hooks/useTTS.js posts JSON.stringify({ text: text.trim(), lang })
Tracked client/dist count: 0 (ignored build output)
Backup files on disk: 26
Untracked top-level report/artifact groups: 6
```

### Lenovo production

```text
Path: /srv/storage/AI_Projects/yt-transcript
Git: fatal: not a git repository; stopped at /srv filesystem boundary
Running process: PID 4054067, cmd `node server.js`, cwd /srv/storage/AI_Projects/yt-transcript
```

Key Lenovo facts:

```text
server.js INDEX_HTML_PATH = path.join(__dirname, 'index.html')
server.js routes: /api/build-version, /api/ai-limit-status, /api/health, /api/lm-status,
                  /api/transcript, /api/transform, /, /api/tts, /api/audio/:id
server.js has ALLOWED_TTS_TYPES = new Set(['reconstruction', 'summary'])
server.js has aiDailyLimitGuard on /api/transform
index.html has active TTS UI and fetch('/api/tts')
client/ contains dist assets only; no client/src
Backup files on production filesystem: 13
```

### File comparison

| File/surface | Mac | Lenovo | Status |
|---|---:|---:|---|
| `server.js` line count | 1214 | 1577 | **diverged** |
| `server.js` diff stat | — | +409 / -46 vs Mac | **high-risk drift** |
| served frontend entry | `client/dist/index.html` | root `index.html` | **different runtime architecture** |
| frontend entry line count | 16 (`client/dist/index.html`) | 2643 (`index.html`) | **different app surface** |
| `package.json` | no `start:prod`, older dependency versions | has `start:prod`, `cors ^2.8.6`, `express ^4.22.2` | low/medium drift |
| `/api/ai-limit-status` | absent | present | functional drift |
| `aiDailyLimitGuard` | absent | present | functional drift |
| TTS enum guard | absent | present | functional drift |

---

## Findings

### F1 — Production runtime is ahead of Mac git and unversioned

**Severity:** high  
**Evidence:** Lenovo `server.js` differs by +409/-46, has `/api/ai-limit-status`, `aiDailyLimitGuard`, `ALLOWED_TTS_TYPES`, TTS prep prompts, and health URLs not present on Mac `main`. Lenovo is not a git repo.

**Impact:** fixes applied on Lenovo can be lost; future Mac builds can overwrite production; agents grepping Mac will miss production bugs.

**Recommendation:** make Mac repo the source of truth by importing Lenovo runtime files into a dedicated branch, then deploy from Mac artifacts to Lenovo.

---

### F2 — Active frontend path differs by environment

**Severity:** high  
**Evidence:** Mac `server.js` serves `client/dist/index.html`; Lenovo `server.js` serves root `index.html`. Lenovo root `index.html` is the 2643-line active UI; Mac has no root `index.html`.

**Impact:** frontend edits in Mac `client/src` do not necessarily affect production. Production UI hotfixes on Lenovo are not represented in source.

**Recommendation:** choose one architecture:

- **Option A (recommended short-term):** single-file frontend source in Mac root `index.html`, matching Lenovo. Commit it. Adjust Mac `server.js` to serve root `index.html` if that is the real direction.
- **Option B (recommended long-term):** migrate Lenovo single-file `index.html` into `client/src` and rebuild Vite cleanly. Higher effort, safer architecture.

---

### F3 — Production filesystem contains sensitive/dirty artifacts

**Severity:** medium/high  
**Evidence:** Lenovo production root contains `.env.backup-*` files, `.write-test`, `server.log`, old component backups, old HTML backups.

**Impact:** `.env.backup-*` can expose stale credentials or provider config. Backup clutter makes production recovery ambiguous.

**Recommendation:** after full backup, move production backups and `.env.backup-*` into a restricted archive outside web/runtime root, e.g. `/srv/storage/AI_Projects/_archive/yt-transcript/YYYYMMDD/`, or delete after confirming external backup exists. Never leave `.env.backup-*` in runtime root.

---

### F4 — Mac repo has untracked reports and backup directory

**Severity:** medium  
**Evidence:** `git status --short` shows 5 untracked reports and `backups/`. `.gitignore` ignores `*.backup-*` but not report artifacts or `backups/`.

**Impact:** commit hygiene risk. Future commits may accidentally include reports, backups, or omit important deploy docs.

**Recommendation:** classify reports:

- keep as docs if still relevant (`DEPLOYMENT_LENOVO_LINUX.md` likely important);
- move operational reports to `docs/reports/` and commit if they document current state;
- move stale backups to `backups/archive/` or delete after backup;
- update `.gitignore` for generated `METRICUS_*_REPORT.md` if reports should not be versioned.

---

### F5 — Dependency/version drift exists but is not root cause

**Severity:** low/medium  
**Evidence:** Lenovo `package.json` adds `start:prod` and bumps `cors`/`express` patch versions compared to Mac.

**Impact:** low direct risk, but confirms manual edits bypassed git.

**Recommendation:** import package changes during source-of-truth reconciliation.

---

## Cleanup plan

### Phase 0 — freeze and backup (mandatory before mutation)

1. Snapshot Mac repo:
   ```bash
   cd /Users/radek/Documents/Projects/yt-transcript
   git status --short
   git branch --show-current
   git log -1 --oneline
   ```
2. Snapshot Lenovo production:
   ```bash
   ssh radek@192.168.8.112 'cd /srv/storage/AI_Projects/yt-transcript && tar --exclude=node_modules -czf /srv/storage/AI_Projects/yt-transcript-backup-$(date +%Y%m%d-%H%M%S).tar.gz .'
   ```
3. Confirm public/local health before cleanup:
   ```bash
   ssh radek@192.168.8.112 'curl -s http://localhost:4002/api/health'
   ```

Rollback: restore Lenovo tarball or copy specific files back from backup; Mac rollback via git branch reset.

---

### Phase 1 — import Lenovo production into Mac audit branch

Create a branch, do not touch `main` directly:

```bash
cd /Users/radek/Documents/Projects/yt-transcript
git checkout -b audit/import-lenovo-production-20260625
```

Bring in production files explicitly:

```bash
scp radek@192.168.8.112:/srv/storage/AI_Projects/yt-transcript/{server.js,index.html,package.json,package-lock.json,.env.example,DEPLOYMENT_LENOVO_LINUX.md} .
```

Then review diff:

```bash
git diff --stat
git diff -- server.js index.html package.json .env.example DEPLOYMENT_LENOVO_LINUX.md
```

Expected: large `server.js` + new root `index.html`. Do not commit until tests pass.

---

### Phase 2 — establish one runtime contract

Pick one:

#### Option A — single-file frontend now (fastest, matches current production)

- commit root `index.html` as active frontend source;
- update Mac `server.js` to serve root `index.html`, matching Lenovo;
- mark `client/src` as legacy/inactive in docs or move to `client-legacy/` only after verifying no build/deploy path uses it;
- keep `client/dist/assets` only if root `index.html` references those assets.

#### Option B — Vite frontend now (cleaner, more work)

- port Lenovo root `index.html` behavior into `client/src`;
- update server to serve `client/dist/index.html` in both Mac and Lenovo;
- rebuild and deploy `client/dist` to Lenovo;
- remove root `index.html` from runtime after verifying `GET /` serves Vite dist.

Recommendation: **Option A now**, then Option B as a separate refactor. Current production already runs Option A.

---

### Phase 3 — production hygiene cleanup

After Lenovo tarball backup:

- move `.env.backup-*` out of runtime root;
- move old `.bak*` and `*.backup-*` out of runtime root;
- delete `.write-test`;
- keep only current runtime files:
  - `.env`
  - `.env.example`
  - `server.js`
  - `index.html`
  - `package.json`
  - `package-lock.json`
  - `manage.sh`
  - `start-frontend.sh` only if still used
  - `client/dist/assets/*` if root `index.html` references them
  - `node_modules/`

Verification after cleanup:

```bash
ssh radek@192.168.8.112 'curl -s http://localhost:4002/api/health && curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4002/'
```

---

### Phase 4 — Mac repo hygiene

- Decide fate of untracked reports:
  - `DEPLOYMENT_LENOVO_LINUX.md` — likely keep/commit or move to `docs/deploy/LENOVO.md`.
  - `METRICUS_*REPORT.md`, `YTTRANSCRIPT_*REPORT.md` — move to `docs/reports/` or archive.
  - `backups/` — inspect, archive, or ignore.
- Update `.gitignore` if generated operational reports should stay local:
  ```gitignore
  # Operational report artifacts
  METRICUS_*_REPORT.md
  YTTRANSCRIPT_*_REPORT.md
  backups/
  *.bak-*
  .env.backup-*
  ```
- Keep `*.backup-*` ignored.

---

## Verification checklist for cleanup completion

Cleanup is done only when all are true:

```text
[ ] Mac branch contains production-equivalent `server.js` and active frontend source.
[ ] `git status --short` is clean except intentional branch changes.
[ ] `npm run build` passes on Mac.
[ ] Existing tests pass: client summary parser + pdf pagination.
[ ] Lenovo production backup exists outside runtime root.
[ ] Lenovo runtime root has no `.env.backup-*`, `.write-test`, or stale `.bak*` clutter.
[ ] Lenovo `GET /api/health` returns 200.
[ ] Lenovo `GET /` returns 200.
[ ] TTS contract test returns 200 for `type:"reconstruction"` and audio file returns 200 `audio/wav`.
[ ] STATE_LOG global + project-level updated.
```

---

## Immediate recommendation

Do **not** start by deleting files. Start by importing Lenovo production into a Mac audit branch, because production is currently the only place that contains the latest working app. After the branch is created and tests pass, cleanup becomes safe and reversible.

Suggested next command sequence:

```bash
cd /Users/radek/Documents/Projects/yt-transcript
git checkout -b audit/import-lenovo-production-20260625
mkdir -p .audit/lenovo-snapshot-20260625
scp radek@192.168.8.112:/srv/storage/AI_Projects/yt-transcript/{server.js,index.html,package.json,package-lock.json,.env.example,DEPLOYMENT_LENOVO_LINUX.md} .audit/lenovo-snapshot-20260625/
diff -ru --exclude=node_modules --exclude=.env . .audit/lenovo-snapshot-20260625
```

Then decide whether to copy the Lenovo files into the root as the new source of truth or to migrate them into `client/src`.
