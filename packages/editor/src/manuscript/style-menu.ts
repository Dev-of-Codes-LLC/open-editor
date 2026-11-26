// The Style menu of the chapter editor: one button that opens a list of every
// style, each with its keyboard shortcut.
//
// It follows the menu button pattern for assistive technology: the button
// says it has a menu and whether it is open; the items are checkboxes (text
// styles, any number at once) and radios (paragraph styles, one at a time).
// Arrow keys move, Home and End jump, Enter and Space choose, Escape closes.
// Choosing a text style keeps the menu open, so several can be set in a row.
// Choosing a paragraph style closes it.

export interface StyleItem {
  /** The command the item runs, with its arguments. */
  id: string;
  label: string;
  /** "check": a text style, on or off. "radio": a paragraph style. "action": does one thing. */
  kind: "check" | "radio" | "action";
  /** The keys, as the engine names them: "Mod-b", "Mod-Shift-s", "Mod-Alt-1". */
  keys: string;
  /** A class that shows the label in its own style, such as bold. */
  look?: string;
}

export interface StyleGroup {
  label: string;
  items: StyleItem[];
}

/** True on a Mac, an iPhone or an iPad, where the command key takes the place of Ctrl. */
export function isApple(view: Window | null): boolean {
  const nav = view?.navigator as (Navigator & { userAgentData?: { platform?: string } }) | undefined;
  return /mac|iphone|ipad|ipod/i.test(nav?.userAgentData?.platform ?? nav?.platform ?? "");
}

/** The keys of a shortcut as a person reads them: "⌘⇧S" on a Mac, "Ctrl+Shift+S" elsewhere. */
export function shortcutText(keys: string, apple: boolean): string {
  const parts = keys.split("-");
  const key = parts.pop() ?? "";
  // "Mod--" would be the minus key; none of ours is, but an empty last part means that.
  const last = key === "" ? "-" : key.length === 1 ? key.toUpperCase() : key;
  const names: Record<string, [string, string]> = { Mod: ["⌘", "Ctrl"], Shift: ["⇧", "Shift"], Alt: ["⌥", "Alt"] };
  // Apple's own order is control, option, shift, command; elsewhere Ctrl, Alt, Shift.
  const order = apple ? ["Alt", "Shift", "Mod"] : ["Mod", "Alt", "Shift"];
  const held = order.filter((name) => parts.includes(name)).map((name) => names[name][apple ? 0 : 1]);
  return apple ? `${held.join("")}${last}` : [...held, last].join("+");
}

/** The same shortcut as assistive technology wants it, for aria-keyshortcuts: "Control+Shift+S" or "Meta+Shift+S". */
function ariaKeys(keys: string, apple: boolean): string {
  return keys
    .split("-")
    .map((part) => (part === "Mod" ? (apple ? "Meta" : "Control") : part.length === 1 ? part.toUpperCase() : part))
    .join("+");
}

export interface StyleMenu {
  /** The button and its menu, to put in the toolbar. */
  element: HTMLElement;
  /** Update the ticks. Called when the selection or the text changes. */
  refresh(): void;
  close(): void;
}

export function createStyleMenu(
  doc: Document,
  options: {
    groups: StyleGroup[];
    /** Show Mac keys or the others. Default: what the browser says it runs on. */
    apple?: boolean;
    run(item: StyleItem): void;
    isActive(item: StyleItem): boolean;
    /** False greys an item out. Default: every item can be chosen. */
    isEnabled?(item: StyleItem): boolean;
    /** Give the keyboard back to the text. */
    focusText(): void;
  },
): StyleMenu {
  const apple = options.apple ?? isApple(doc.defaultView);
  const wrap = doc.createElement("div");
  wrap.className = "oe-style";

  const button = doc.createElement("button");
  button.type = "button";
  button.className = "oe-button oe-style-button";
  button.textContent = "Style";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");
  const menuId = `oe-style-menu-${Math.random().toString(36).slice(2, 8)}`;
  button.setAttribute("aria-controls", menuId);

  const menu = doc.createElement("div");
  menu.className = "oe-style-menu";
  menu.id = menuId;
  menu.setAttribute("role", "menu");
  menu.setAttribute("aria-label", "Style");
  menu.hidden = true;

  const rows: { item: StyleItem; el: HTMLElement }[] = [];
  for (const group of options.groups) {
    const section = doc.createElement("div");
    section.className = "oe-style-group";
    section.setAttribute("role", "group");
    section.setAttribute("aria-label", group.label);
    const heading = doc.createElement("div");
    heading.className = "oe-style-heading";
    heading.setAttribute("aria-hidden", "true");
    heading.textContent = group.label;
    section.append(heading);
    for (const item of group.items) {
      const el = doc.createElement("div");
      el.className = "oe-style-item";
      el.setAttribute("role", item.kind === "check" ? "menuitemcheckbox" : item.kind === "radio" ? "menuitemradio" : "menuitem");
      if (item.kind !== "action") el.setAttribute("aria-checked", "false");
      el.setAttribute("aria-keyshortcuts", ariaKeys(item.keys, apple));
      el.tabIndex = -1;
      el.dataset.style = item.id;
      const tick = doc.createElement("span");
      tick.className = "oe-style-tick";
      tick.setAttribute("aria-hidden", "true");
      const label = doc.createElement("span");
      label.className = `oe-style-label${item.look ? ` ${item.look}` : ""}`;
      label.textContent = item.label;
      const keys = doc.createElement("kbd");
      keys.className = "oe-style-keys";
      keys.textContent = shortcutText(item.keys, apple);
      el.append(tick, label, keys);
      // Keep the selection in the text when an item is pressed with the mouse.
      el.addEventListener("mousedown", (event) => event.preventDefault());
      el.addEventListener("click", () => choose(item));
      rows.push({ item, el });
      section.append(el);
    }
    menu.append(section);
  }

  const isOpen = () => !menu.hidden;
  function refresh(): void {
    for (const { item, el } of rows) {
      if (item.kind !== "action") el.setAttribute("aria-checked", String(options.isActive(item)));
      // A greyed-out item can still be reached with the arrows, so a screen reader can say why it is there.
      if (enabled(item)) el.removeAttribute("aria-disabled");
      else el.setAttribute("aria-disabled", "true");
    }
  }
  const enabled = (item: StyleItem) => options.isEnabled?.(item) ?? true;
  function open(focus: "first" | "last" | "none" = "first"): void {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
    refresh();
    if (focus !== "none") rows[focus === "first" ? 0 : rows.length - 1].el.focus();
    doc.addEventListener("mousedown", outside, true);
  }
  function close(): void {
    if (!isOpen()) return;
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
    doc.removeEventListener("mousedown", outside, true);
  }
  const outside = (event: Event) => {
    if (!wrap.contains(event.target as Node)) close();
  };
  function choose(item: StyleItem): void {
    if (!enabled(item)) return;
    options.run(item);
    if (item.kind === "check") {
      // The text has the keyboard now. Tick the item and keep the menu open for the next one.
      refresh();
      rows.find((row) => row.item === item)?.el.focus();
    } else {
      close();
      options.focusText();
    }
  }

  button.addEventListener("mousedown", (event) => event.preventDefault());
  button.addEventListener("click", () => (isOpen() ? (close(), options.focusText()) : open("none")));
  button.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      open("first");
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      open("last");
    }
  });
  menu.addEventListener("keydown", (event) => {
    const at = rows.findIndex((row) => row.el === doc.activeElement);
    const go = (index: number) => rows[(index + rows.length) % rows.length].el.focus();
    switch (event.key) {
      case "ArrowDown":
        go(at + 1);
        break;
      case "ArrowUp":
        go(at - 1);
        break;
      case "Home":
        go(0);
        break;
      case "End":
        go(rows.length - 1);
        break;
      case "Enter":
      case " ":
        if (at >= 0) choose(rows[at].item);
        break;
      case "Escape":
        close();
        options.focusText();
        break;
      case "Tab":
        close();
        return;
      default: {
        // A letter jumps to the next item that starts with it.
        if (event.key.length !== 1 || event.ctrlKey || event.metaKey || event.altKey) return;
        const letter = event.key.toLowerCase();
        for (let step = 1; step <= rows.length; step++) {
          const row = rows[(at + step + rows.length) % rows.length];
          if (row.item.label.toLowerCase().startsWith(letter)) {
            row.el.focus();
            break;
          }
        }
      }
    }
    event.preventDefault();
    event.stopPropagation();
  });

  wrap.append(button, menu);
  return { element: wrap, refresh, close };
}
