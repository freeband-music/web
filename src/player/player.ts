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

/** Wraps one audio element. Plays URLs; knows nothing about where they come from. */
export class Player {
  private readonly audio = new Audio();
  private state: PlayerState = { status: "idle", position: 0, duration: 0 };
  private hasSource = false;

  constructor(private readonly events: PlayerEvents) {
    const audio = this.audio;
    audio.preload = "auto";
    const on = (name: string, handler: () => void) =>
      audio.addEventListener(name, () => {
        if (this.hasSource) handler();
      });
    on("playing", () => this.update({ status: "playing" }));
    on("waiting", () => this.update({ status: "loading" }));
    on("pause", () => {
      if (this.state.status !== "error") this.update({ status: "paused" });
    });
    on("timeupdate", () => this.update({ position: audio.currentTime }));
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
  }

  play(url: string): void {
    this.hasSource = true;
    this.update({ status: "loading", position: 0, duration: 0 });
    this.audio.src = url;
    this.start();
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
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
    this.update({ status: "idle", position: 0, duration: 0 });
  }

  seek(seconds: number): void {
    if (!this.hasSource) return;
    this.audio.currentTime = seconds;
    this.update({ position: seconds });
  }

  setVolume(volume: number): void {
    this.audio.volume = Math.min(Math.max(volume, 0), 1);
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
