# Process Cleanup

When you need to kill dev processes (ports, vite, boardsmith, etc.), use the pre-approved script:

```bash
.claude/scripts/cleanup-dev.sh
```

Do NOT write inline process cleanup commands - use this script instead.

# Utility Scripts

Use these pre-approved scripts instead of writing inline commands. They are auto-approved and save permission prompts.

## Running the dev server

```bash
# Foreground with timeout (default 60s)
.claude/scripts/dev.sh [timeout_seconds]

# Background with output file
.claude/scripts/dev-bg.sh [timeout_seconds]
```

## Running tests

```bash
.claude/scripts/test.sh [timeout_seconds] [extra_args...]
```

## Running node scripts

```bash
.claude/scripts/run-node.sh <script.mjs> [timeout_seconds]
```

## Reading output files

```bash
.claude/scripts/tail-output.sh <file> [wait_seconds] [lines]
```

Do NOT write inline timeout/sleep/tail commands - use these scripts instead.
