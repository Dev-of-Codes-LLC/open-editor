# 0009: One Style menu, and a wider chapter format behind it

Date: 2026-11-25. Status: accepted.

## Decision

1. **One menu holds every style.** The chapter editor's row of buttons is replaced by one button, Style, that opens a list of every style with its keyboard shortcut.
2. **Eighteen entries in three groups.**
   - Text: bold, italic, underline, strikethrough, highlight, code, superscript, subscript.
   - Paragraph: normal text, heading 1 to 3, bullet list, numbered list, block quote.
   - Formatting: copy formatting, paste formatting, clear formatting.
3. **The chapter format grew to hold them.** Six new marks (`underline`, `strike`, `highlight`, `code`, `superscript`, `subscript`) and one new block (`blockquote`). A style that only showed on screen would have been lost on save.
4. **The shortcuts are the engine's own defaults**, so they are the keys other editors on the same engine use. Three are ours: Ctrl+Alt+C and Ctrl+Alt+V for copy and paste formatting, and Ctrl+\ for clear formatting.
5. **The menu shows the keys of the platform it runs on**: `Ctrl+Shift+S` on Windows and Linux, `⇧⌘S` on a Mac.
6. **Text styles tick and the menu stays open. A paragraph style closes it.** Text styles combine, so an author often sets several. A paragraph has one style.
7. **Superscript and subscript replace each other.** Text cannot be both, in the editor and in the format.
8. **Copy formatting carries text styles only**, not heading level, list or quote. Paste gives the selection exactly the copied styles.
9. **The copied formatting is one for the page**, so it works across chapters. It is not the system clipboard.
10. **The editor takes the keyboard at once** when asked, with the engine's view and not its focus command.

## The shortcuts

| Style | Windows and Linux | Mac |
| --- | --- | --- |
| Bold | Ctrl+B | ⌘B |
| Italic | Ctrl+I | ⌘I |
| Underline | Ctrl+U | ⌘U |
| Strikethrough | Ctrl+Shift+S | ⇧⌘S |
| Highlight | Ctrl+Shift+H | ⇧⌘H |
| Code | Ctrl+E | ⌘E |
| Superscript | Ctrl+. | ⌘. |
| Subscript | Ctrl+, | ⌘, |
| Normal text | Ctrl+Alt+0 | ⌥⌘0 |
| Heading 1, 2, 3 | Ctrl+Alt+1, 2, 3 | ⌥⌘1, 2, 3 |
| Bullet list | Ctrl+Shift+8 | ⇧⌘8 |
| Numbered list | Ctrl+Shift+7 | ⇧⌘7 |
| Block quote | Ctrl+Shift+B | ⇧⌘B |
| Copy formatting | Ctrl+Alt+C | ⌥⌘C |
| Paste formatting | Ctrl+Alt+V | ⌥⌘V |
| Clear formatting | Ctrl+\ | ⌘\ |

## Why

**One menu.** A row of buttons does not scale past five or six, and it cannot show a shortcut next to each style. A menu can, and it teaches the keys.

**Why the keys for copy formatting have Alt.** Word uses Ctrl+Shift+C. In a browser that opens the developer tools, and a page cannot take it. Ctrl+Alt+C is what Google Docs uses for the same reason.

**Why paste replaces.** A person who copies formatting expects the target to look like the source. Adding the copied styles to what is there gives a third look that is neither.

**Why text styles only.** Pasting "heading" onto one selected word would restyle its whole paragraph. That surprise is worse than the gap.

**Why the editor takes focus at once.** The engine's own focus command waits one frame. In that frame a key lands in the wrong place, and the late focus can take the keyboard back from where the person has gone next. A test caught the second case about once in six runs in WebKit. It passed 20 runs of 20 after the change. The same change removes the "caret arrives a frame late" finding in decision 0008.

## What the tests found

- **Ctrl+Shift+S would have saved the book** as well as striking the text. The save key now ignores Shift.
- **Choosing a paragraph style dropped text styles** that were switched on and not typed with yet.

## Cost, and what would change this

- **Some shortcuts belong to the browser first.** Ctrl+Shift+B shows the bookmarks bar in Chrome and Edge, and ⌘, opens settings on a Mac. The tests press keys inside the page and cannot see that. A shortcut that never reaches the page needs another key.
- **Ctrl+Alt is AltGr on some keyboards** and may type a character. Not tested.
- **Code cannot be combined with another style.** That is the engine's rule.
- **A block quote holds paragraphs only**, like a list item.
- **No link, colour, font, size or alignment.** A link needs a place to type its address. The others are a real question for a manuscript editor and were left out on purpose.
- **Only the chapter editor has the menu.** The small prose field of `createEditor({ profile: "manuscript" })` keeps its four buttons: its Markdown format cannot hold the new styles.
- **For a moment after a mouse click the engine undoes a caret key** such as Home. The tests wait 300 ms after a click. It has not been seen at a person's speed.
