# LifeOS verification map

The maintained source for verifying user-facing LifeOS behavior. Read this index, then use the matching feature file.

## Baseline preconditions

- A sandbox you started (`.sf/bin/sandbox start` with your own `SF_SANDBOX_NAME`), doctor OK.
- Data is a fresh copy of the snapshot; restart the sandbox to reset state.
- Never drive port 3000 or an instance you did not start.

## Driving conventions

- Roles and accessible names, never coordinates.
- Mutations use synthetic text and undo themselves.
- Prove mutations twice: on screen and through the API.
- An unreachable path is reported as unreachable, never as verified through another path.

## Features

- [Today](./today.md) `/`
- [Inbox](./inbox.md) `/decide`
- [Assistant](./assistant.md) `/chat`
- [Training](./training.md) `/workouts`
- [Money](./money.md) `/finance`
- [System](./system.md) `/status`
- [Settings](./settings.md) `/settings`
- [Habits](./habits.md) `/settings/habits`
- [Saved](./saved.md) `/saved`
- [Teach](./teach.md) `/knowledge/teach`
- [Shopping](./shopping.md) `/shopping`
