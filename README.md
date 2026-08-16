# opencli-plugin-coros-coach

Manage a signed-in [COROS Training Hub](https://t.coros.com/admin/views/schedule)
calendar from the command line. The plugin refreshes the access token inside the
browser session; it does not print or persist the token.

## Requirements

- Node.js 20 or newer
- OpenCLI 1.8.6 or newer
- A Chrome profile signed in to COROS Training Hub

## Install

Install directly from GitHub:

```bash
opencli plugin install github:zczhuohuo/opencli-plugin-coros-coach
```

For local development, clone the repository and install its absolute path:

```bash
git clone https://github.com/zczhuohuo/opencli-plugin-coros-coach.git
cd opencli-plugin-coros-coach
opencli plugin install "file://$PWD"
npm install
```

## Commands

| Command | Access | Description |
| --- | --- | --- |
| `coros-coach/schedule` | Read | List planned sessions for a date range, optionally including completed sessions. |
| `coros-coach/add-run` | Write | Calculate and create a time-based running session. |

### List the schedule

```bash
opencli coros-coach schedule \
  --start-date 20260817 \
  --end-date 20260823

opencli coros-coach schedule \
  --start-date 20260817 \
  --end-date 20260823 \
  --include-completed
```

Dates use `YYYYMMDD`.

### Add a run

Preview the calculated session without changing the COROS calendar:

```bash
opencli coros-coach add-run \
  --date 20260817 \
  --name "Easy run" \
  --duration 00:40:00 \
  --low 80 \
  --high 88 \
  --dry-run
```

Remove `--dry-run` to save it:

```bash
opencli coros-coach add-run \
  --date 20260817 \
  --name "Easy run" \
  --duration 00:40:00 \
  --low 80 \
  --high 88
```

`low` and `high` are percentages of lactate-threshold heart rate. COROS first
calculates the estimated distance and training load, then the plugin updates the
schedule. The command currently creates one time-targeted run; reusable courses
and multi-step workouts are outside its scope.

## Development

```bash
npm install
npm run check

# After installing the local plugin, validate its registered commands.
opencli validate coros-coach
```

The source tree separates platform entry points from the COROS implementation:

```text
.
├── src/
│   ├── commands/       # OpenCLI command registrations
│   └── coros/          # Coach interface, browser adapter, and payload builder
├── test/               # Tests through the coach interface
├── add-run.ts          # Root loader required by OpenCLI
└── schedule.ts         # Root loader required by OpenCLI
```

The `createCorosCoach` interface in `src/coros/coach.ts` owns validation,
orchestration, and output shaping. COROS session and payload details remain
behind that seam. `npm install` and `npm run build` bundle each command into an
ignored root-level JavaScript runtime file because OpenCLI discovers plugins
from the repository root.

## License

[MIT](LICENSE)
