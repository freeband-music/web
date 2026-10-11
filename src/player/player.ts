export type PlayerStatus = "idle" | "loading" | "playing" | "paused" | "error";

export interface PlayerState {
  status: PlayerStatus;
  /** Seconds. */
  position: number;
  /** Seconds; 0 while unknown. */
  duration: number;
}

export interface PlayerEvents {
  onState(state: PlayerState): void;
  onEnded(): void;
  onError(): void;
}

export interface MediaInfo {
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
}

export interface MediaActions {
  play(): void;
  pause(): void;
  next(): void;
  previous(): void;
  seek(seconds: number): void;
}

/**
 * Plays URLs; knows nothing about where they come from. A second audio
 * element can load the next URL ahead of time, so the switch at a track
 * change is immediate (and later, gapless or crossfaded).
 */
export class Player {
  private audio = this.createAudio();
  private standby = this.createAudio();
  /** The URL loaded into `standby`, if any. */
  private standbyUrl: string | null = null;
  private state: PlayerState = { status: "idle", position: 0, duration: 0 };
  private hasSource = false;
  /** Position to seek to once the new source's metadata has loaded. */
  private startAt = 0;

  constructor(private readonly events: PlayerEvents) {}

  private createAudio(): HTMLAudioElement {
    const audio = new Audio();
    audio.preload = "auto";
    // Only the playing element reports; the standby one loads silently.
    const on = (name: string, handler: () => void) =>
      audio.addEventListener(name, () => {
        if (this.hasSource && audio === this.audio) handler();
      });
    on("playing", () => this.update({ status: "playing" }));
    on("waiting", () => this.update({ status: "loading" }));
    on("pause", () => {
      if (this.state.status !== "error") this.update({ status: "paused" });
    });
    on("timeupdate", () => this.update({ position: audio.currentTime }));
    on("loadedmetadata", () => {
      if (this.startAt > 0) audio.currentTime = this.startAt;
      this.startAt = 0;
    });
    on("durationchange", () => {
      if (Number.isFinite(audio.duration)) this.update({ duration: audio.duration });
    });
    on("ended", () => {
      this.update({ status: "paused" });
      this.events.onEnded();
    });
    on("error", () => {
      this.update({ status: "error" });
      this.events.onError();
    });
    audio.addEventListener("error", () => {
      if (audio === this.standby) this.clearPreload();
    });
    return audio;
  }

  /** Plays a URL, optionally from a position in seconds. Uses the preloaded element when it holds this URL. */
  play(url: string, startAt = 0): void {
    this.hasSource = true;
    if (url === this.standbyUrl) {
      const previous = this.audio;
      this.audio = this.standby;
      this.standby = previous;
      this.standbyUrl = null;
      empty(previous);
      const ready = Number.isFinite(this.audio.duration) ? this.audio.duration : 0;
      this.update({ status: "loading", position: startAt, duration: ready });
      this.startAt = 0;
      this.audio.currentTime = startAt;
    } else {
      this.update({ status: "loading", position: startAt, duration: 0 });
      this.startAt = startAt;
      this.audio.src = url;
    }
    this.start();
  }

  /** Starts loading a URL that is likely to be played next. */
  preload(url: string): void {
    if (url === this.standbyUrl) return;
    this.standbyUrl = url;
    this.standby.src = url;
    this.standby.load();
  }

  clearPreload(): void {
    if (this.standbyUrl === null) return;
    this.standbyUrl = null;
    empty(this.standby);
  }

  pause(): void {
    this.audio.pause();
  }

  resume(): void {
    if (this.hasSource) this.start();
  }

  /** Stops playback and drops the current source. */
  stop(): void {
    this.hasSource = false;
    empty(this.audio);
    this.update({ status: "idle", position: 0, duration: 0 });
  }

  seek(seconds: number): void {
    if (!this.hasSource) return;
    this.audio.currentTime = seconds;
    this.update({ position: seconds });
  }

  setVolume(volume: number): void {
    for (const audio of [this.audio, this.standby]) audio.volume = Math.min(Math.max(volume, 0), 1);
  }

  setMuted(muted: boolean): void {
    for (const audio of [this.audio, this.standby]) audio.muted = muted;
  }

  get loaded(): boolean {
    return this.hasSource && this.state.status !== "error";
  }

  setMediaInfo(info: MediaInfo | null): void {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = info
      ? new MediaMetadata({
          title: info.title,
          artist: info.artist,
          album: info.album,
          artwork: info.artwork ? [{ src: info.artwork }] : [],
        })
      : null;
  }

  setMediaActions(actions: MediaActions): void {
    if (!("mediaSession" in navigator)) return;
    const session = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler) => {
      try {
        session.setActionHandler(action, handler);
      } catch {
        // This browser does not support the action.
      }
    };
    set("play", () => actions.play());
    set("pause", () => actions.pause());
    set("nexttrack", () => actions.next());
    set("previoustrack", () => actions.previous());
    set("seekto", (details) => {
      if (details.seekTime !== undefined) actions.seek(details.seekTime);
    });
  }

  private start(): void {
    // A rejected play() is either superseded by a newer source, reported
    // through the error event, or blocked autoplay, which leaves it paused.
    this.audio.play().catch((error: unknown) => {
      if (error instanceof DOMException && error.name === "NotAllowedError" && this.hasSource) {
        this.update({ status: "paused" });
      }
    });
  }

  private update(patch: Partial<PlayerState>): void {
    this.state = { ...this.state, ...patch };
    this.events.onState(this.state);
  }
}

function empty(audio: HTMLAudioElement): void {
  audio.pause();
  audio.removeAttribute("src");
  audio.load();
}
