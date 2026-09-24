# Usage Window

Know which account has room before you start the next run. A compact usage window for BB.

A plugin for [BB](https://getbb.app).

## Highlights

- **All reported quotas.** Claude and Codex accounts, including model-specific limits when available.
- **Time to reset.** Per-limit usage bars and countdowns, with explicit stale and missing readings.
- **Fits your workspace.** Drag, resize, minimize, and keep your preferred position.
- **Refresh on click.** Refresh pulls fresh quotas from every provider; click an account to refresh just that one.
- **Account details.** Inspect readiness, plan, identity, and observation age without leaving BB.

## Install

```sh
bb plugin install https://github.com/dillionverma/bb-plugin-usage-window
```

Requires BB 0.43+ and a compatible Plugin SDK (see `package.json`).

## Use

Enable BB’s **Account Pooler** first. Usage Window displays the quotas it reports.

`bb pool-monitor status` prints the current readings.

## Designed to stay responsive

Virtualized rows keep off-screen accounts out of the rendered list. Reads share a 3-second cache; visible clients poll every 5 seconds and hidden tabs pause. Drag and resize updates use animation frames. Upstream quotas are fetched only when you click Refresh or an account row; the plugin never changes routing.

## Development

```sh
npm ci
npm run typecheck
npm test
bb plugin build .
```

Focused fixes and reproducible bug reports are welcome. Include BB version, platform, and steps to reproduce.

## Compatibility

The repository and display name are independent of BB’s persistent plugin identity. The internal ID remains `pool-monitor` so existing settings, stored data, CLI commands, and integrations continue to work.

## The Ultra suite

Built for getting work done across multiple threads, agents, and projects. Install only the pieces you need.

- [Ultra Sidebar](https://github.com/dillionverma/bb-plugin-ultra-sidebar) — Organize parallel work.
- [Ultra Launcher](https://github.com/dillionverma/bb-plugin-ultra-launcher) — Start the next run.
- [Ultra Topbar](https://github.com/dillionverma/bb-plugin-ultra-topbar) — Turn threads into pull requests.
- [Linear Panel](https://github.com/dillionverma/bb-plugin-linear-panel) — Keep issues beside execution.

## License

MIT. See [LICENSE](LICENSE).
