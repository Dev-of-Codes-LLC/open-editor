// The two changes to a book that touch more than one chapter: moving a
// chapter and removing one. Both return a new manifest and leave the one they
// were given as it was.
//
// The rule behind both: a comment or a reference holds a chapter id (and, in
// time, a block id), never a position. So a move changes one list and nothing
// that points at the chapter. A removal keeps the id in `removed`, so whatever
// still points at it resolves to "removed" and names the chapter by its old
// title. The chapter's document file is not touched here; the host decides
// whether to keep it.

import type { Book } from "./types";

/** Move a chapter to a new place in the reading order. `to` counts from 0 and is clamped to the list. */
export function moveChapter(book: Book, id: string, to: number): Book {
  const from = book.chapters.findIndex((entry) => entry.id === id);
  if (from < 0) throw new Error(`No chapter with the id "${id}".`);
  const chapters = [...book.chapters];
  const [entry] = chapters.splice(from, 1);
  chapters.splice(Math.max(0, Math.min(to, chapters.length)), 0, entry);
  return { ...book, chapters };
}

/** Take a chapter out of the reading order and keep its id and title in `removed`. */
export function removeChapter(book: Book, id: string): Book {
  const entry = book.chapters.find((chapter) => chapter.id === id);
  if (!entry) throw new Error(`No chapter with the id "${id}".`);
  return {
    ...book,
    chapters: book.chapters.filter((chapter) => chapter.id !== id),
    removed: [...(book.removed ?? []), { id: entry.id, title: entry.title }],
  };
}

/** Where an id points now: a chapter and its place, a removed chapter, or nothing this book ever had. */
export function resolveChapter(
  book: Book,
  id: string,
): { state: "present"; title: string; position: number } | { state: "removed"; title: string } | { state: "unknown" } {
  const position = book.chapters.findIndex((entry) => entry.id === id);
  if (position >= 0) return { state: "present", title: book.chapters[position].title, position };
  const gone = book.removed?.find((entry) => entry.id === id);
  return gone ? { state: "removed", title: gone.title } : { state: "unknown" };
}
