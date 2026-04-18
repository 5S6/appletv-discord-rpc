# appletv-discord-rpc

shows what you're watching in the macOS TV app as your Discord activity

## what it does

polls the TV app every ~15 seconds, grabs the title, fetches the poster, and updates your Discord presence with the movie/show name, genre, year, and a progress bar. clears automatically when you pause, stop, or quit TV.app.

## requirements

- macOS
- [Deno](https://deno.land) — `brew install deno`
- Discord desktop app (not browser) with **Settings → Privacy → Display current activity as a status message** turned on

## run it

```bash
deno run --allow-env --allow-run --allow-net --allow-read --allow-write --allow-ffi --allow-import --unstable-kv appletv_discord.ts
```

first run will ask if you want it to auto-start on login.

## install via homebrew (coming soon)

```bash
brew tap alekisok/appletv-discord-rpc
brew install appletv-discord-rpc
brew services start appletv-discord-rpc
```

## remove autostart

```bash
launchctl unload ~/Library/LaunchAgents/com.appletv-discord-rpc.plist
rm ~/Library/LaunchAgents/com.appletv-discord-rpc.plist
```
