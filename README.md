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

## install via homebrew

```bash
brew tap 5S6/appletv-discord-rpc
brew install --HEAD appletv-discord-rpc
brew services start appletv-discord-rpc
```

`--HEAD` is the current source from this repo, which is what you want until the next tagged release is published.

## remove autostart

```bash
launchctl unload ~/Library/LaunchAgents/com.appletv-discord-rpc.plist
rm ~/Library/LaunchAgents/com.appletv-discord-rpc.plist
```
