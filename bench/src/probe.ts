// What every engine page shares: reading the fixture name from the address,
// timing the load, and timing each key press.
//
// To the next frame. A key press arrives with the time the browser received
// it (event.timeStamp). The page asks for the next animation frame, and in
// that frame posts itself a message. The message is handled after the
// frame's style, layout and paint work. The figure is the time of that
// message minus the key's time stamp.
//
// It is what a person waits. Much of it can be the wait for the screen's
// next frame: on a 60 Hz screen that alone is anywhere from 0 to 17 ms. So
// this figure answers "is it fast enough", and it is a poor way to tell two
// fast engines apart. For that, the runner reads the browser's own count of
// main-thread time before and after a batch of keys (see run.mjs).
//
// It does not see the compositor or the display. It is measured the same
// way for every engine, which is what a comparison needs.

import type { FixtureName } from "./fixtures";

export interface Subject {
  /** Build the editor with the fixture. Called once. */
  mount(host: HTMLElement, fixture: FixtureName): void | Promise<void>;
  /** Put the caret at the marker in the middle of the document, and focus the editor. */
  placeCaret(): void | Promise<void>;
  /** The length of the document as the engine holds it, to prove the keys arrived. */
  length(): number;
  /** The whole text, for code subjects: the runner uses it to check where the keys landed. */
  text?(): string;
}

/** Resolve after the next frame's style, layout and paint work. */
const afterPaint = () =>
  new Promise<number>((resolve) => {
    requestAnimationFrame(() => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve(performance.now());
      channel.port2.postMessage(0);
    });
  });

export function run(name: string, subject: Subject): void {
  const fixture = (new URLSearchParams(location.search).get("fixture") ?? "code-1mb") as FixtureName;
  const host = document.getElementById("host") as HTMLElement;
  let toFrame: number[] = [];

  // Capture phase on the window: this runs before the engine's own handlers.
  window.addEventListener(
    "keydown",
    (event) => {
      const pressed = event.timeStamp;
      void afterPaint().then((painted) => toFrame.push(painted - pressed));
    },
    true,
  );

  (window as any).bench = {
    name,
    fixture,
    /** Milliseconds from the start of mount to the end of the second frame after it. */
    async load(): Promise<{ mountMs: number; toFirstFrameMs: number }> {
      const start = performance.now();
      await subject.mount(host, fixture);
      const mounted = performance.now();
      await afterPaint();
      // One more frame: some engines finish their first layout in a second pass.
      const painted = await afterPaint();
      return { mountMs: mounted - start, toFirstFrameMs: painted - start };
    },
    placeCaret: () => subject.placeCaret(),
    length: () => subject.length(),
    /** Where the typed keys landed: the line's number, its length, and the column the keys start at. */
    typedAt(): { line: number; lineLength: number; column: number } | null {
      const text = subject.text?.();
      if (text === undefined) return null;
      const at = text.indexOf("abcdefghijabcdefghij");
      if (at < 0) return null;
      const before = text.slice(0, at);
      const lineStart = before.lastIndexOf("\n") + 1;
      const lineEnd = text.indexOf("\n", at);
      return { line: before.split("\n").length, lineLength: (lineEnd < 0 ? text.length : lineEnd) - lineStart, column: at - lineStart };
    },
    /** The figures collected since the last call, in milliseconds. */
    takeSamples(): number[] {
      const out = toFrame;
      toFrame = [];
      return out;
    },
  };
}
