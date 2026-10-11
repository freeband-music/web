// Menus (a popover on desktop, a bottom sheet on phones), dialogs and toasts.
// One of each is shown at a time; `<Overlays />` renders them once in the shell.

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type FormEvent, type ReactNode } from "react";
import { create } from "zustand";
import { Icon, type IconName } from "./icons";
import { useRoute } from "./router";

export const PHONE_QUERY = "(max-width: 768px)";

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
  );
}

export const useIsPhone = () => useMediaQuery(PHONE_QUERY);

// Menus

export interface MenuEntry {
  label: string;
  icon?: IconName;
  onSelect?(): void;
  /** Navigates there (the menu closes). */
  href?: string;
  /** Opens a sub-page of the menu instead of acting. */
  page?: () => MenuPage;
  danger?: boolean;
  disabled?: boolean;
}

export type MenuItem = MenuEntry | "separator";

export interface MenuContext {
  close(): void;
  back(): void;
  push(page: MenuPage): void;
}

export interface MenuPage {
  /** Shown with a back button on sub-pages. */
  title?: string;
  /** Shown at the top of the bottom sheet on phones (for example the track). */
  header?: ReactNode;
  items?: MenuItem[];
  /** Custom content, below the items. */
  render?(context: MenuContext): ReactNode;
}

/** A point (a right-click) or an element (a "…" button; the menu opens below it, right-aligned). */
export type MenuAnchor = { x: number; y: number } | Element;

interface Placement {
  x: number;
  y: number;
  /** For element anchors: the menu's right edge goes at `x`, and it may flip above `top`. */
  alignRight: boolean;
  top: number;
}

interface OverlayState {
  menu: { placement: Placement; stack: MenuPage[] } | null;
  dialog: DialogRequest | null;
  toasts: { id: number; message: string }[];
}

interface DialogRequest {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  /** A second action next to the confirm button; resolves with "alt". */
  altLabel?: string;
  danger?: boolean;
  input?: { label: string; value?: string; placeholder?: string };
  resolve(value: string | boolean | null): void;
}

const useOverlays = create<OverlayState>()(() => ({ menu: null, dialog: null, toasts: [] }));

export function openMenu(anchor: MenuAnchor, page: MenuPage): void {
  let placement: Placement;
  if (anchor instanceof Element) {
    const rect = anchor.getBoundingClientRect();
    placement = { x: rect.right, y: rect.bottom + 4, alignRight: true, top: rect.top - 4 };
  } else {
    placement = { x: anchor.x, y: anchor.y, alignRight: false, top: anchor.y };
  }
  useOverlays.setState({ menu: { placement, stack: [page] } });
}

export const closeMenu = () => useOverlays.setState({ menu: null });

function MenuItems({ items, context }: { items: MenuItem[]; context: MenuContext }) {
  return (
    <>
      {items.map((item, index) => {
        if (item === "separator") return <hr key={`sep-${index}`} className="menu-separator" />;
        const select = () => {
          if (item.page) {
            context.push(item.page());
            return;
          }
          context.close();
          item.onSelect?.();
        };
        const body = (
          <>
            {item.icon && <Icon name={item.icon} />}
            <span className="menu-label">{item.label}</span>
            {item.page && <Icon name="chevron" />}
          </>
        );
        const className = item.danger ? "menu-item danger" : "menu-item";
        return item.href ? (
          <a key={item.label} className={className} href={item.href} onClick={() => context.close()} role="menuitem">
            {body}
          </a>
        ) : (
          <button key={item.label} className={className} onClick={select} disabled={item.disabled} role="menuitem">
            {body}
          </button>
        );
      })}
    </>
  );
}

function MenuView() {
  const menu = useOverlays((s) => s.menu);
  const phone = useIsPhone();
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>();
  const page = menu?.stack[menu.stack.length - 1];

  useLayoutEffect(() => {
    const element = ref.current;
    if (!menu || !element || phone) return;
    const { width, height } = element.getBoundingClientRect();
    const { x, y, alignRight, top } = menu.placement;
    const maxLeft = window.innerWidth - width - 8;
    const left = Math.max(8, Math.min(alignRight ? x - width : x, maxLeft));
    let at = y;
    if (at + height > window.innerHeight - 8) at = alignRight ? top - height : y - height;
    setPosition({ left, top: Math.max(8, Math.min(at, window.innerHeight - height - 8)) });
  }, [menu, page, phone]);

  useEffect(() => {
    if (!menu) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && closeMenu();
    const onDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) closeMenu();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onDown, true);
    window.addEventListener("resize", closeMenu);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onDown, true);
      window.removeEventListener("resize", closeMenu);
    };
  }, [menu]);

  if (!menu || !page) return null;
  const context: MenuContext = {
    close: closeMenu,
    back: () => useOverlays.setState({ menu: { ...menu, stack: menu.stack.slice(0, -1) } }),
    push: (next) => useOverlays.setState({ menu: { ...menu, stack: [...menu.stack, next] } }),
  };
  const content = (
    <div
      ref={ref}
      className={phone ? "menu sheet" : "menu"}
      role="menu"
      style={phone ? undefined : { left: position?.left ?? -9999, top: position?.top ?? 0 }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {menu.stack.length > 1 ? (
        <div className="menu-title">
          <button className="icon-button" onClick={context.back} aria-label="Back">
            <Icon name="back" />
          </button>
          <span>{page.title}</span>
        </div>
      ) : (
        phone && page.header && <div className="menu-header">{page.header}</div>
      )}
      {page.items && <MenuItems items={page.items} context={context} />}
      {page.render?.(context)}
    </div>
  );
  return phone ? <div className="backdrop sheet-backdrop">{content}</div> : content;
}

// Dialogs

const FOCUSABLE = 'a[href], button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), [tabindex]:not([tabindex="-1"])';

/**
 * A modal panel with a title. Escape and a click outside close it; Tab stays
 * inside it, and focus goes back where it was when it closes.
 */
export function Modal(props: { title: string; onClose(): void; children: ReactNode; footer?: ReactNode }) {
  const { onClose } = props;
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const element = panel.current;
    if (element && !element.contains(document.activeElement)) element.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close.current();
        return;
      }
      if (event.key !== "Tab" || !element) return;
      const items = [...element.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const inside = element.contains(document.activeElement);
      if (event.shiftKey && (document.activeElement === first || !inside)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || !inside)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (before && document.contains(before)) before.focus();
    };
  }, []);
  return (
    <div className="backdrop" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={props.title} ref={panel}>
        <header className="modal-head">
          <h2>{props.title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Icon name="remove" />
          </button>
        </header>
        {props.children}
        {props.footer && <footer className="modal-actions">{props.footer}</footer>}
      </div>
    </div>
  );
}

function DialogView() {
  const dialog = useOverlays((s) => s.dialog);
  const [value, setValue] = useState("");
  useEffect(() => setValue(dialog?.input?.value ?? ""), [dialog]);
  if (!dialog) return null;
  const finish = (result: string | boolean | null) => {
    useOverlays.setState({ dialog: null });
    dialog.resolve(result);
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (dialog.input) {
      if (value.trim()) finish(value.trim());
    } else finish(true);
  };
  const cancel = () => finish(dialog.input ? null : false);
  return (
    <Modal title={dialog.title} onClose={cancel}>
      <form className="dialog-form" onSubmit={submit}>
        {dialog.message && <div className="dialog-message">{dialog.message}</div>}
        {dialog.input && (
          <input
            type="text"
            aria-label={dialog.input.label}
            placeholder={dialog.input.placeholder ?? dialog.input.label}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        )}
        <div className="modal-actions">
          <button type="button" className="button ghost" onClick={cancel}>
            Cancel
          </button>
          {dialog.altLabel && (
            <button type="button" className="button" onClick={() => finish("alt")}>
              {dialog.altLabel}
            </button>
          )}
          <button
            className={dialog.danger ? "button danger" : "button primary"}
            disabled={dialog.input !== undefined && !value.trim()}
            autoFocus={!dialog.input}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function ask(request: Omit<DialogRequest, "resolve">): Promise<string | boolean | null> {
  const previous = useOverlays.getState().dialog;
  previous?.resolve(previous.input ? null : false);
  return new Promise((resolve) => useOverlays.setState({ dialog: { ...request, resolve } }));
}

export async function confirmDialog(options: {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return (await ask({ confirmLabel: "OK", ...options })) === true;
}

/** Like `confirmDialog` with a second action: "confirm", "alt" or "cancel". */
export async function choiceDialog(options: {
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  altLabel: string;
}): Promise<"confirm" | "alt" | "cancel"> {
  const result = await ask(options);
  return result === true ? "confirm" : result === "alt" ? "alt" : "cancel";
}

/** Asks for a line of text; null when cancelled. */
export async function promptDialog(options: {
  title: string;
  label: string;
  value?: string;
  placeholder?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  const { label, value, placeholder, ...rest } = options;
  const result = await ask({ confirmLabel: "Save", ...rest, input: { label, value, placeholder } });
  return typeof result === "string" ? result : null;
}

// Toasts

const TOAST_MS = 3000;
let toastId = 0;

export function toast(message: string): void {
  toastId += 1;
  const id = toastId;
  useOverlays.setState({ toasts: [...useOverlays.getState().toasts.slice(-2), { id, message }] });
  setTimeout(() => useOverlays.setState({ toasts: useOverlays.getState().toasts.filter((t) => t.id !== id) }), TOAST_MS);
}

function Toasts() {
  const toasts = useOverlays((s) => s.toasts);
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.message}
        </div>
      ))}
    </div>
  );
}

export function Overlays() {
  const route = useRoute();
  const key = JSON.stringify(route);
  useEffect(() => closeMenu(), [key]);
  return (
    <>
      <MenuView />
      <DialogView />
      <Toasts />
    </>
  );
}
