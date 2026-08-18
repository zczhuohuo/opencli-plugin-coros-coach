# opencli-plugin-coros-coach

Read training context and manage a signed-in [COROS Training Hub](https://t.coros.com/admin/views/dash-board)
calendar from the command line. The plugin calls the Training Hub APIs instead
of scraping visible page text. It refreshes the access token inside the browser
session and never prints or persists the token.

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
| `coros-coach/dashboard` | Read | Read fitness, load, recovery, zones, predictions, HRV, and recent-performance context. |
| `coros-coach/activities` | Read | Query paginated historical activities with optional date and sport filters. |
| `coros-coach/schedule` | Read | List planned sessions for a date range, optionally including completed sessions. |
| `coros-coach/strength-exercises` | Read | List the current account's COROS strength action catalog. |
| `coros-coach/add-run` | Write | Calculate and create a time-based running session. |
| `coros-coach/add-strength` | Write | Calculate and create a strength session from COROS actions. |

### Read training context

The dashboard command combines the two APIs behind the Training Hub dashboard
into one stable record for downstream planning:

```bash
opencli coros-coach dashboard -f json
```

It includes running level and sub-scores, short- and long-term load, load ratio,
recovery, threshold heart rate and pace, heart-rate and pace zones, race
predictions, HRV, seven-day performance, recent activities, and the current
week's totals. To inspect all fields returned by COROS while developing a new
planning rule, add `--raw` and use JSON output:

```bash
opencli coros-coach dashboard --raw -f json
```

### Query activity history

Without filters, the command returns the newest 50 activities. A date range,
sport codes, activity-name keyword, and explicit pagination are optional:

```bash
opencli coros-coach activities -f json

opencli coros-coach activities \
  --start-date 20260701 \
  --end-date 20260817 \
  --sport-types 100,101,102,103 \
  --page 1 \
  --page-size 100 \
  -f json
```

Common run codes are `100` outdoor, `101` indoor, `102` trail, and `103`
track. Every row exposes its COROS `label_id`, normalized duration, distance,
pace, heart rate, training load, ascent, calories, and pagination metadata.
Use `--raw` to retain the complete source record alongside those stable fields.

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

The catalog is cached locally for seven days. A cache hit does not navigate to
COROS or refresh the account token. Refresh it immediately when the account's
actions or language changes:

```bash
opencli coros-coach strength-exercises --refresh -f json
```

COROS commands use one persistent OpenCLI site session. Sign in once in the
window opened for `coros-coach`; subsequent commands reuse that authenticated
session instead of creating a new one-shot browser context.

The Training Hub currently groups actions by body part, equipment, muscle, and
custom actions. Its body-part filters are full body, shoulders and neck, arms,
chest, back, waist and abdomen, and glutes and legs. Examples observed in the
catalog include `热身`, `深蹲`, `臀桥`, `俯卧撑`, `俯身哑铃划船`, `平板支撑`,
`死虫式`, and `放松`. The command remains the source of truth when COROS adds,
removes, localizes, or customizes actions. The `target_unit` and `target`
columns come directly from each COROS catalog record (`targetType` and
`targetValue`). For example, the current `靠墙静蹲` and `平板支撑` records are
time-based, while `深蹲` is repetition-based.

If COROS returns duplicate localized names, use the row's `origin_id` in
`exercises` or `exercise-plan` to select the exact catalog record.

### Add a strength session

For a detailed course where every action has its own prescription, pass an
`exercise-plan` JSON array. Each item requires an exact catalog `name` or
`origin_id` and may override `sets`, `reps` or `duration`, `weightKg`, and
`rest`. A duration may be an exact target or a recommended range:

```bash
opencli coros-coach add-strength \
  --date 20260817 \
  --name "居家跑者力量（徒手）" \
  --exercise-plan '[
    {"name":"热身","sets":1,"duration":"00:08:00","rest":"00:00:00"},
    {"name":"深蹲","sets":3,"reps":10,"rest":"00:01:00"},
    {"name":"单腿臀桥","sets":3,"reps":10,"rest":"00:01:00"},
    {"name":"反向弓步","sets":2,"reps":8,"rest":"00:01:00"},
    {"name":"单腿提踵","sets":3,"reps":15,"rest":"00:01:00"},
    {"name":"靠墙静蹲","sets":3,"duration":"00:00:30-00:00:45","rest":"00:01:00"},
    {"name":"侧卧抬腿","sets":2,"reps":15,"rest":"00:00:45"},
    {"name":"死虫式","sets":2,"reps":8,"rest":"00:00:45"}
  ]' \
  --description "瑜伽垫＋瑜伽砖；单腿动作按每侧次数执行；保留2–3次余力。" \
  --dry-run
```

`duration` uses `HH:MM:SS` or `HH:MM:SS-HH:MM:SS` and creates a time-targeted
COROS action card. COROS stores one time target, so a range such as 30–45 seconds
uses 45 seconds for the watch timer and keeps the complete range in the course
note and preview. An item cannot contain both `reps` and `duration`.

When neither field is present, the plugin uses the action's live COROS
`target_unit`. Time-based actions use `--hold-duration 00:00:30-00:00:45`;
repetition-based or unknown actions use `--reps`. The other omitted fields
inherit `sets`, `weight-kg`, and `rest`. Use exactly one of `exercise-plan` and
the simpler comma-separated `exercises` option.

To override an incorrect or account-specific COROS unit for selected actions,
pass an exact action name or `origin_id`:

```bash
--target-units '{"靠墙静蹲":"time","平板支撑转体":"reps"}'
```

Explicit per-action `reps` or `duration` in `exercise-plan` has higher priority
than this command-line override.

The original shorthand remains available when every action shares one
prescription:

Preview the example 35-minute full-body plan without saving it:

```bash
opencli coros-coach add-strength \
  --date 20260816 \
  --name "全身力量" \
  --exercises "热身,深蹲,臀桥,俯卧撑,俯身哑铃划船,平板支撑,死虫式,放松" \
  --sets 3 \
  --reps 10 \
  --hold-duration 00:00:30-00:00:45 \
  --weight-kg 0 \
  --rest 00:01:00 \
  --target-duration 00:35:00 \
  --description "包含热身、深蹲、臀桥、推、拉、核心与放松安排；按实际器械记录负重。" \
  --dry-run
```

Action names must exactly match `strength-exercises`. The defaults are 3 sets,
10 repetitions for repetition-based actions, a 30–45 second range for
time-based actions, 0 kg, and 60 seconds of rest. Explicit `reps` or `duration`
always overrides the catalog unit. Remove `--dry-run` only after reviewing the
payload and COROS estimate.

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
├── activities.ts       # Historical activity loader
├── dashboard.ts        # Training-context loader
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
