# Playback telemetry generator (video-core-js · internal/video-rig)

Nightly + on-demand GitHub Actions workflow that drives the three New Relic video
trackers — **VideoJS, Shaka, dash.js** — against real players/streams in headless
browsers and generates NRVA telemetry into the **staging** NR account. It's a
**generator, not a pass/fail gate**: events land in NR, keyed by `runId` + `viewId`,
and you eyeball / query them. Mirrors the Android/iOS `playback-master` workflows.

Lives only on the fork branch `internal/video-rig`. Never merged to master.

## Files
- `playback-master.yml` — orchestrator: `discover → test → summary`.
- `playback-test.yml` — reusable: one `(tracker × version × leg)` run over its scenarios → `SUMMARY.txt`.
- `playback-defaults.json` — trackers, legs, scenarios, `min_version`.
- `../../harness/run.mjs` — Playwright runner that drives `samples/rig/index.html` and captures `viewId` + sent events.
- `samples/rig/index.html` — unified multi-player rig (loads the tracker UMD from CDN by version, so **no build step**).

## Matrix
`tracker (videojs|shaka|dash) × version × leg (chromium|firefox|webkit) × scenario`.
- **content** scenarios run on all trackers; **`ad-ssai`** runs on **videojs only**.
- Tracker versions auto-resolve to each repo's latest release (override via dispatch).

## Run it
`Actions → playback-master → Run workflow`. Inputs: `trackers`, `tracker_versions`,
`legs`, `scenarios`, `min_version`, and **`mt_url`**.

## 💰 MediaTailor cost gate (important)
`ad-ssai` hits **AWS MediaTailor, which is paid**. It is:
- **videojs-only**, and
- **NEVER run on the nightly schedule**, and
- run **only** when you pass a non-empty **`mt_url`** on manual dispatch (or set repo var `MT_PLAYBACK_URL`).
Otherwise `ad-ssai` is skipped (`ad-ssai: skipped (no MT URL — paid, opt-in only)`).
The nightly runs only free `content-*` / `error` scenarios.

## Required secrets / vars (fork → Settings → Secrets and variables → Actions)
- **Secret** `NEW_RELIC_LICENSE_KEY` — the NR ingest/license key. *(Already set.)*
- **Var** `MT_PLAYBACK_URL` *(optional)* — a default MediaTailor URL to allow `ad-ssai` without typing `mt_url` each run. Leave unset to keep MT strictly manual.
- NR **beacon** (`staging-bam-cell.nr-data.net`) and **applicationID** (`333053917`) are **base64 constants** in `samples/rig/index.html`, decoded at init — not secrets, not plaintext.

## Correlation
Every event carries native `viewId` + `runId` (+ `trackerType`, `trackerVersion`, `leg`, `scenarioId` custom attrs). The run summary lists `scenario → viewId`; use `WHERE runId='<run>'` in NR to find the events.
