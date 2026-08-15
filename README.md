# opencli-plugin-coros-coach

Manage a signed-in COROS Training Hub calendar through COROS's authenticated
JSON APIs. The access token is refreshed inside the browser session and is
never printed or persisted by the plugin.

## Install

```bash
# From local development directory
opencli plugin install file:///Users/zczhuohuo/Documents/Codex/2026-08-15/new-chat/outputs/coros-coach

# From GitHub
opencli plugin install github:zczhuohuo/opencli-plugin-coros-coach
```

## Commands

| Command | Access | Description |
|---------|--------|-------------|
| `coros-coach/schedule` | Read | Queries planned sessions for any date range; optionally completed sessions too. |
| `coros-coach/add-run` | Write | Calculates and creates a time-based running session through the API. |

## Usage

Sign into [COROS Training Hub](https://t.coros.com/admin/views/schedule) in the
Chrome profile used by OpenCLI. API queries are not limited to the currently
rendered calendar month.

```bash
# Read what is planned for the week
opencli coros-coach schedule --start-date 20260817 --end-date 20260823

# Check planned and completed sessions together
opencli coros-coach schedule --start-date 20260817 --end-date 20260823 --include-completed

# Calculate distance/load and preview the payload without changing your plan
opencli coros-coach add-run \
  --date 20260817 --name '轻松跑' --duration 00:40:00 \
  --low 80 --high 88 --dry-run

# Save a session; this changes the live COROS schedule
opencli coros-coach add-run \
  --date 20260817 --name '轻松跑' --duration 00:40:00 \
  --low 80 --high 88
```

`low` and `high` are percentage bounds of lactate-threshold heart rate. COROS's
`training/program/calculate` endpoint computes estimated distance and training
load before `training/schedule/update` is called. The command currently adds
one time-targeted run; reusable multi-step courses are outside its scope.

## Development

```bash
# Install locally for development (symlinked, changes reflect immediately)
opencli plugin install file:///Users/zczhuohuo/Documents/Codex/2026-08-15/new-chat/outputs/coros-coach

# Verify commands are registered
opencli list | grep coros-coach

# Run a command
opencli validate ./outputs/coros-coach
opencli coros-coach schedule --start-date 20260817 --end-date 20260823
```
