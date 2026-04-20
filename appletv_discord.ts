#!/usr/bin/env deno run --allow-env --allow-run --allow-net --allow-read --allow-write --allow-ffi --allow-import --unstable-kv
import type { Activity } from "https://deno.land/x/discord_rpc@0.3.2/mod.ts";
import { Client } from "https://deno.land/x/discord_rpc@0.3.2/mod.ts";
import type {} from "https://raw.githubusercontent.com/NextFire/jxa/v0.0.5/run/global.d.ts";
import { run } from "https://raw.githubusercontent.com/NextFire/jxa/v0.0.5/run/mod.ts";

const DISCORD_CLIENT_ID = Deno.env.get("APPLETV_RPC_CLIENT_ID") ?? "1494921491026935938";
const OMDB_API_KEY = Deno.env.get("APPLETV_RPC_OMDB_KEY") ?? "83b3b84d";
const TIMEOUT = 15_000;

class AppleTVDiscordRPC {
  private artworkCache = new Map<string, string | undefined>();

  private constructor(
    public readonly rpc: Client,
    public readonly kv: Deno.Kv,
  ) {}

  static async create(): Promise<AppleTVDiscordRPC> {
    const rpc = new Client({ id: DISCORD_CLIENT_ID });
    const home = Deno.env.get("HOME") ?? ".";
    const kv = await Deno.openKv(`${home}/.appletv-discord-rpc.sqlite3`);
    return new this(rpc, kv);
  }

  async run(): Promise<void> {
    while (true) {
      await this.loop();
      console.log("reconnecting in", TIMEOUT, "ms");
      await sleep(TIMEOUT);
    }
  }

  tryClose(): void {
    if (this.rpc.ipc) {
      try {
        this.rpc.close();
      } finally {
        this.rpc.ipc = undefined;
      }
    }
  }

  async loop(): Promise<void> {
    try {
      await this.rpc.connect();
      console.log("connected");
      while (true) {
        const next = await this.setActivity();
        await sleep(next);
      }
    } catch (err) {
      console.error(err);
      try { await this.rpc.clearActivity(); } catch { /* ignore */ }
    } finally {
      this.tryClose();
    }
  }

  async setActivity(): Promise<number> {
    const open = await isTVOpen();
    if (!open) {
      await this.rpc.clearActivity();
      return TIMEOUT;
    }

    const state = await getTVState();
    if (!state || state.playerState === "stopped" || state.playerState === "paused") {
      await this.rpc.clearActivity();
      return TIMEOUT;
    }

    const { title, duration, position, genre, year, show, seasonNumber, episodeNumber, episodeID } = state;

    let delta: number | undefined;
    let start: number | undefined;
    let end: number | undefined;
    if (duration) {
      delta = (duration - position) * 1000;
      end = Math.ceil(Date.now() + delta);
      start = Math.ceil(Date.now() - position * 1000);
    }

    const isShow = !!show;

    let details: string;
    let sub: string;
    let artworkQuery: string;

    if (isShow) {
      details = title;
      const epTag = episodeID || formatEpisodeTag(seasonNumber, episodeNumber);
      sub = epTag ? `${show} • ${epTag}` : show;
      artworkQuery = show;
    } else {
      details = title;
      sub = [genre, year].filter(Boolean).join(" • ");
      artworkQuery = title;
    }

    const artwork = await this.getArtwork(artworkQuery);

    const activity: Activity = {
      // @ts-ignore type 3 = watching
      type: 3,
      details: clamp(details),
      state: sub ? clamp(sub) : undefined,
      timestamps: { start, end },
      assets: {
        large_image: artwork ?? "appletv",
        large_text: clamp(isShow ? show : title),
      },
    };

    await this.rpc.setActivity(activity);
    console.log("playing:", isShow ? `${show} - ${title}` : title, sub);

    return Math.min((delta ?? TIMEOUT) + 1000, TIMEOUT);
  }

  async getArtwork(title: string): Promise<string | undefined> {
    if (this.artworkCache.has(title)) return this.artworkCache.get(title);

    const cached = await this.kv.get<string>(["artwork", title]);
    if (cached.value) {
      this.artworkCache.set(title, cached.value);
      return cached.value;
    }

    const url = await fetchArtwork(title);
    this.artworkCache.set(title, url);
    
    if (url) await this.kv.set(["artwork", title], url);
    return url;
  }
}

const client = await AppleTVDiscordRPC.create();
await setupAutostart(client.kv);
await client.run();

async function setupAutostart(kv: Deno.Kv): Promise<void> {
  if (!isInteractiveTerminal()) return;

  if (Deno.env.get("HOMEBREW_MANAGED")) {
    const check = await new Deno.Command("launchctl", {
      args: ["list", "homebrew.mxcl.appletv-discord-rpc"],
      stderr: "null",
      stdout: "null",
    }).output();
    if (check.success) return;

    const seen = await kv.get(["asked_brew_service"]);
    if (seen.value) return;
    await kv.set(["asked_brew_service"], true);

    const answer = prompt("add to login items so it runs on startup? (y/n):");
    if (answer?.toLowerCase() !== "y") return;

    const result = await new Deno.Command("brew", {
      args: ["services", "start", "appletv-discord-rpc"],
    }).output();
    if (result.success) {
      console.log("enabled — will start automatically on login");
    } else {
      console.log("run manually: brew services start appletv-discord-rpc");
    }
    return;
  }

  const seen = await kv.get(["asked_autostart"]);
  if (seen.value) return;
  await kv.set(["asked_autostart"], true);

  const answer = prompt("add to login items so it runs on startup? (y/n):");
  if (answer?.toLowerCase() !== "y") return;

  const home = Deno.env.get("HOME")!;
  const denoPath = Deno.execPath();
  const scriptPath = new URL(import.meta.url).pathname;
  const label = "com.appletv-discord-rpc";
  const plistPath = `${home}/Library/LaunchAgents/${label}.plist`;

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${denoPath}</string>
    <string>run</string>
    <string>--allow-env</string>
    <string>--allow-run</string>
    <string>--allow-net</string>
    <string>--allow-read</string>
    <string>--allow-write</string>
    <string>--allow-ffi</string>
    <string>--allow-import</string>
    <string>--unstable-kv</string>
    <string>${scriptPath}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key>
    <string>${home}</string>
    <key>APPLETV_RPC_CLIENT_ID</key>
    <string>${DISCORD_CLIENT_ID}</string>
    <key>APPLETV_RPC_OMDB_KEY</key>
    <string>${OMDB_API_KEY}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${home}/Library/Logs/appletv-discord-rpc.log</string>
  <key>StandardErrorPath</key>
  <string>${home}/Library/Logs/appletv-discord-rpc.log</string>
</dict>
</plist>`;

  await Deno.writeTextFile(plistPath, plist);

  const load = new Deno.Command("launchctl", { args: ["load", plistPath] });
  await load.output();

  console.log("added to login items — will start automatically on next login");
  console.log("to remove: launchctl unload", plistPath);
}

function formatEpisodeTag(season: number, episode: number): string {
  if (!season && !episode) return "";
  if (!season) return `E${String(episode).padStart(2, "0")}`;
  return `S${String(season).padStart(2, "0")}E${String(episode).padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isInteractiveTerminal(): boolean {
  return Deno.stdin.isTerminal() && Deno.stdout.isTerminal() && Deno.stderr.isTerminal();
}

// discord requires 2-128 chars
function clamp(s: string, min = 2, max = 128): string {
  if (s.length < min) return s.padEnd(min);
  return s.length <= max ? s : s.slice(0, max - 3) + "...";
}

async function isTVOpen(): Promise<boolean> {
  try {
    return await run(() => Application("System Events").processes["TV"].exists());
  } catch {
    return false;
  }
}

interface TVState {
  title: string;
  playerState: string;
  position: number;
  duration: number;
  genre: string;
  year: number;
  show: string;
  seasonNumber: number;
  episodeNumber: number;
  episodeID: string;
}

async function getTVState(): Promise<TVState | null> {
  try {
    return await run((): TVState | null => {
      // deno-lint-ignore no-explicit-any
      const tv = Application("TV") as any;
      const playerState = tv.playerState() as string;
      if (playerState === "stopped") return null;

      const position = tv.playerPosition() as number;
      let title = "Apple TV";
      let duration = 0;
      let genre = "";
      let year = 0;

      let show = "";
      let seasonNumber = 0;
      let episodeNumber = 0;
      let episodeID = "";

      try {
        const track = tv.currentTrack();
        title = track.name() || title;
        duration = track.duration() || 0;
        genre = track.genre() || "";
        year = track.year() || 0;
        show = track.show() || "";
        seasonNumber = track.seasonNumber() || 0;
        episodeNumber = track.episodeNumber() || 0;
        episodeID = track.episodeID() || "";
      } catch {
        // streaming/drm content won't have track metadata, fall back to window title
        try {
          const winName = tv.windows[0].name() as string;
          if (winName && winName !== "TV") title = winName;
        } catch { /* nothing we can do */ }
      }

      return { title, playerState, position, duration, genre, year, show, seasonNumber, episodeNumber, episodeID };
    });
  } catch {
    return null;
  }
}

async function fetchArtwork(title: string): Promise<string | undefined> {
  try {
    const params = new URLSearchParams({ t: title, apikey: OMDB_API_KEY });
    const resp = await fetch(`https://www.omdbapi.com/?${params}`);
    const json = await resp.json() as { Poster?: string };
    const poster = json.Poster;
    return poster && poster !== "N/A" ? poster : undefined;
  } catch {
    return undefined;
  }
}
