// Inline SVG icons on a 24×24 grid, filled with the current colour.

const PATHS = {
  play: "M7 4.5v15l13-7.5z",
  pause: "M6 4.5h4.5v15H6zm7.5 0H18v15h-4.5z",
  next: "M5 4.5v15l10-7.5zM16.5 4.5H19v15h-2.5z",
  previous: "M19 4.5v15L9 12zM5 4.5h2.5v15H5z",
  up: "M12 7l7 8H5z",
  down: "M12 17l7-8H5z",
  remove: "M6.4 5L12 10.6 17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4z",
  add: "M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z",
  heart:
    "M12 20.5l-1.3-1.2C6 15 3 12.3 3 8.9 3 6.2 5.1 4 7.8 4c1.5 0 3 .7 4.2 1.9C13.2 4.7 14.7 4 16.2 4 18.9 4 21 6.2 21 8.9c0 3.4-3 6.1-7.7 10.4z",
  heartOutline:
    "M16.2 4c-1.5 0-3 .7-4.2 1.9C10.8 4.7 9.3 4 7.8 4 5.1 4 3 6.2 3 8.9c0 3.4 3 6.1 7.7 10.4l1.3 1.2 1.3-1.2C18 15 21 12.3 21 8.9 21 6.2 18.9 4 16.2 4zm-4.1 14l-.1.1-.1-.1C7.1 13.7 5 11.7 5 8.9 5 7.2 6.2 6 7.8 6c1.2 0 2.5.8 2.9 1.9h2.6c.4-1.1 1.7-1.9 2.9-1.9C17.8 6 19 7.2 19 8.9c0 2.8-2.1 4.8-6.9 9.1z",
  shuffle:
    "M10.6 9.2L5.4 4 4 5.4l5.2 5.2zM14.5 4l2 2L4 18.6 5.4 20 18 7.5l2 2V4zm.3 9.4l-1.4 1.4 3.1 3.1-2 2H20v-5.5l-2 2z",
  repeat: "M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z",
  volume: "M3 9v6h4l5 5V4L7 9zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4z",
  mute: "M3 9v6h4l5 5V4L7 9zm18.5 1.4L20.1 9 18 11.1 15.9 9l-1.4 1.4 2.1 2.1-2.1 2.1 1.4 1.4 2.1-2.1 2.1 2.1 1.4-1.4-2.1-2.1z",
  home: "M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z",
  search:
    "M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z",
  library: "M4 3h2v18H4zm5 0h2v18H9zm4.3.6l1.9-.7 6.2 17.4-1.9.7z",
  more: "M5 10.2a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm7 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6zm7 0a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z",
  note: "M9 4h11v3h-9v10.5A3.5 3.5 0 1 1 9 15V4z",
  queue: "M3 5h14v2H3zm0 4h14v2H3zm0 4h8v2H3zm12 0l6 3.5-6 3.5z",
  user: "M12 3a4.5 4.5 0 1 1 0 9 4.5 4.5 0 0 1 0-9zm0 11c4.4 0 8 2.2 8 5v2H4v-2c0-2.8 3.6-5 8-5z",
  back: "M15.4 4.6L8 12l7.4 7.4-1.4 1.4L5.2 12 14 3.2z",
  chevron: "M8.6 4.6L16 12l-7.4 7.4 1.4 1.4 8.8-8.8L10 3.2z",
  check: "M9.5 16.2L5.3 12l-1.4 1.4 5.6 5.6 11-11-1.4-1.4z",
  clock: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm1 2v4.6l3.4 2-1 1.7L11 12.7V7z",
  grid: "M4 4h7v7H4zm9 0h7v7h-7zM4 13h7v7H4zm9 0h7v7h-7z",
  list: "M4 5h16v2H4zm0 6h16v2H4zm0 6h16v2H4z",
  album: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 6.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5z",
  addCircle:
    "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm1 3v3h3v2h-3v3h-2v-3H8v-2h3V8z",
  checkCircle: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm-1.5 12.2l6.4-6.4-1.4-1.4-5 5-2.1-2.1-1.4 1.4z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
