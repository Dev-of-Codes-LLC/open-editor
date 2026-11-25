// Source files keep their line endings. The editor works on "\n" inside and
// writes the document back with the ending the file came with.

export type LineEnding = "\n" | "\r\n";

/** The line ending of a document: "\r\n" when it has more of those than bare "\n". */
export function detectLineEnding(text: string): LineEnding {
  const crlf = text.split("\r\n").length - 1;
  const lf = text.split("\n").length - 1 - crlf;
  return crlf > lf ? "\r\n" : "\n";
}
