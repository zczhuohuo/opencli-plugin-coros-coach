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
| `coros-coach/strength-exercises` | Read | List the current account's COROS strength action catalog. |
| `coros-coach/add-run` | Write | Calculate and create a time-based running session. |
| `coros-coach/add-strength` | Write | Calculate and create a strength session from COROS actions. |

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

### List supported strength actions

COROS serves the strength catalog for each signed-in account. Query it before
building a session instead of relying on hard-coded IDs:

```bash
opencli coros-coach strength-exercises -f json
```

The Training Hub currently groups actions by body part, equipment, muscle, and
custom actions. Its body-part filters are full body, shoulders and neck, arms,
chest, back, waist and abdomen, and glutes and legs. Examples observed in the
catalog include `热身`, `深蹲`, `臀桥`, `俯卧撑`, `俯身哑铃划船`, `平板支撑`,
`死虫式`, and `放松`. The command remains the source of truth when COROS adds,
removes, localizes, or customizes actions.

### Add a strength session

Preview the example 35-minute full-body plan without saving it:

```bash
opencli coros-coach add-strength \
  --date 20260816 \
  --name "全身力量" \
  --exercises "热身,深蹲,臀桥,俯卧撑,俯身哑铃划船,平板支撑,死虫式,放松" \
  --sets 3 \
  --reps 10 \
  --weight-kg 0 \
  --rest 00:01:00 \
  --target-duration 00:35:00 \
  --description "包含热身、深蹲、臀桥、推、拉、核心与放松安排；按实际器械记录负重。" \
  --dry-run
```

Action names must exactly match `strength-exercises`. The defaults are 3 sets,
10 repetitions, 0 kg, and 60 seconds of rest for every action. Remove `--dry-run`
only after reviewing the payload and COROS estimate.

`target-duration` records the planning goal in command output. COROS does not
provide a force-total-duration field for strength courses; it calculates the
actual estimate from actions, sets, repetitions, and rest. Compare
`target_duration` with `estimated_duration` in the preview and adjust the plan
when they differ.

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
├── add-strength.ts     # Root loader required by OpenCLI
├── add-run.ts          # Root loader required by OpenCLI
├── schedule.ts         # Root loader required by OpenCLI
└── strength-exercises.ts
```

The `createCorosCoach` interface in `src/coros/coach.ts` owns validation,
orchestration, and output shaping. COROS session and payload details remain
behind that seam. `npm install` and `npm run build` bundle each command into an
ignored root-level JavaScript runtime file because OpenCLI discovers plugins
from the repository root.

## License

[MIT](LICENSE)
