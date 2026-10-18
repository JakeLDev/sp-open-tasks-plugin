# Open Tasks: a Super Productivity plugin

A pane for [Super Productivity](https://github.com/super-productivity/super-productivity).
It lists all open tasks from every project on one screen, so you do not need to open each project.

## What it shows

- All open tasks, grouped by project, with a count for each project. Click a project name to open that project in Super Productivity. The arrow next to a project name hides or shows its tasks.
- A "Due today or overdue" section at the top.
- Two views. "By project" is the default. "My order" puts all open top-level tasks in one list that you set the order of. Drag a task, or use the up and down arrows. The order is saved with `persistDataSynced`, so it syncs like other Super Productivity data. A new task goes to the end of the list.
- Tasks with a leading step number (`#1`, `#2`) are sorted by that number. Other tasks come after them.
- Due date, time spent and estimate, and the links on each task (PRs, Jira tickets).
- A filter box for titles, notes and subtask titles.
- A checkbox on each task and subtask that marks it done. A toast with an Undo button shows for 8 seconds. A task with open subtasks has a disabled checkbox until its subtasks are done, so one click never completes more than one task.
- An arrow on each task that shows its notes and subtasks. A small arrow next to the notes cuts them to one line and keeps the subtasks open. "Expand all" and "Collapse all" buttons do this for every task. "Expand all" also shows the tasks of collapsed projects.
- Click a task or subtask title to open its details in Super Productivity's right-hand panel (needs a version with `PluginAPI.selectTask`).

The pane refreshes every 5 seconds and when the window gets focus.

## Privacy and permissions

- The plugin reads tasks and projects through the Super Productivity plugin API.
- The only change it makes to tasks is marking a task done (`isDone` and `doneOn`), or undoing that. It also saves the "My order" list as plugin data. It asks for the `showIndexHtmlAsView` permission only. It has no Node access and no network code.
- Task text is shown as plain text. Links open only when they start with `http://` or `https://`.

## Install

1. Build the zip:
   ```bash
   zip open-tasks-plugin.zip manifest.json plugin.js index.html icon.svg
   ```
2. In Super Productivity, go to **Settings → Plugins → Upload Plugin** and select the zip.
3. Open **Open Tasks** from the menu.

## Tests

```bash
npm test
```

The tests need Node 20 or newer and no packages. They load the script from `index.html` into a small fake page with a fake `PluginAPI`. The fake API rejects bad update payloads the same way Super Productivity does. Example: `doneOn` must be a number or `undefined`, never `null`. When the app rejects a new payload, add that rule to `validateTaskUpdate` in `test/harness.mjs` and write a test for it.

## Files

| File | Purpose |
|---|---|
| `manifest.json` | Plugin name, version and permissions |
| `index.html` | The pane. Its script is inline, because Super Productivity serves only this file to the plugin frame |
| `plugin.js` | Empty on purpose. The menu entry opens `index.html` |
| `icon.svg` | Menu icon |
| `test/` | Tests and the fake page and API they use |

## Known limits

- The pane was checked in the Super Productivity desktop app (list, grouping and links). Opening the task panel and the done checkbox with Undo were tested in a browser with a mock API only.
- The pane needs the `PluginAPI` that Super Productivity gives to the plugin frame. If it is missing, the pane shows an error.
