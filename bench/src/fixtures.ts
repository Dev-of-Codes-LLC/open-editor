// The documents every engine is measured on. They are made here from a fixed
// seed, so every run and every engine gets the same bytes, and no large file
// sits in the repository.
//
//   code-1mb         about 1 MB of ordinary JavaScript, lines under 100 characters
//   code-long-lines  about 1 MB of JavaScript in 20 lines of about 50,000 characters each
//   chapter-20k      one chapter of 20,000 words, with headings and some bold and italic
//   code-tiny        about 2 kB of the same JavaScript: the control, to show each engine's floor
//   chapter-tiny     about 300 words of the same prose: the control
//
// Each holds one marker, in the middle, where the benchmark puts the caret.

export const MARKER = "BENCHMIDDLE";
export type FixtureName = "code-tiny" | "code-1mb" | "code-long-lines" | "chapter-tiny" | "chapter-20k";

// A small seeded generator (mulberry32): the same numbers on every machine.
function random(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const NAMES = ["amount", "total", "flour", "butter", "weight", "count", "index", "result", "value", "batch", "tray", "oven", "minutes", "ratio", "portion", "yield"];
const VERBS = ["scale", "mix", "fold", "rest", "bake", "cool", "weigh", "divide", "shape", "score", "proof", "measure"];

function statement(next: () => number): string {
  const pick = <T>(list: T[]) => list[Math.floor(next() * list.length)];
  const a = pick(NAMES), b = pick(NAMES), c = pick(NAMES);
  const n = Math.floor(next() * 900) + 1;
  switch (Math.floor(next() * 5)) {
    case 0:
      return `const ${a}${n} = (${b} * ${n}) / (${c} + 1);`;
    case 1:
      return `if (${a} > ${n}) { ${b} = ${pick(VERBS)}(${c}, ${n}); }`;
    case 2:
      return `for (let i = 0; i < ${a}.length; i++) { ${b} += ${a}[i] * ${n}; }`;
    case 3:
      return `log("${pick(VERBS)} ${a} for ${n} minutes", { ${b}, ${c} });`;
    default:
      return `return ${pick(VERBS)}(${a}, ${b}) + ${n};`;
  }
}

function codeFunction(next: () => number, id: number): string[] {
  const lines = [`// ${VERBS[id % VERBS.length]} step ${id}`, `function ${VERBS[id % VERBS.length]}${id}(${NAMES[id % NAMES.length]}, ${NAMES[(id + 3) % NAMES.length]}) {`];
  const body = 4 + Math.floor(next() * 8);
  for (let k = 0; k < body; k++) lines.push(`  ${statement(next)}`);
  lines.push("}", "");
  return lines;
}

export function code(bytes: number): string {
  const next = random(1);
  const lines: string[] = [];
  let size = 0;
  let marked = false;
  for (let id = 1; size < bytes; id++) {
    if (!marked && size >= bytes / 2) {
      lines.push(`// ${MARKER}`, "");
      marked = true;
    }
    for (const line of codeFunction(next, id)) {
      lines.push(line);
      size += line.length + 1;
    }
  }
  return lines.join("\n");
}

export const code1mb = () => code(1_000_000);
export const codeTiny = () => code(2_000);

export function codeLongLines(): string {
  const next = random(2);
  const lines: string[] = [];
  for (let n = 0; n < 20; n++) {
    if (n === 10) lines.push(`// ${MARKER}`);
    let line = "";
    while (line.length < 50_000) line += statement(next);
    lines.push(line);
  }
  return lines.join("\n");
}

// --- The chapter -----------------------------------------------------------------
// In the shape of the manuscript format, so the same value feeds every rich-text engine.

export type Mark = { type: "bold" } | { type: "italic" };
export interface Text {
  type: "text";
  text: string;
  marks?: Mark[];
}
export type Block =
  | { type: "paragraph"; content: Text[] }
  | { type: "heading"; attrs: { level: 1 }; content: Text[] };

const WORDS = ["the", "oven", "was", "warm", "and", "bread", "rose", "slowly", "before", "light", "a", "baker", "counted", "trays", "of", "flour", "on", "bench", "while", "street", "slept", "under", "rain", "that", "fell", "since", "midnight", "without", "sound", "or", "hurry", "each", "loaf", "took", "its", "time", "in", "heat", "then", "cooled", "by", "open", "door", "where", "first", "people", "waited", "with", "coins", "ready"];

export function chapter(target: number): { blocks: Block[]; words: number } {
  const next = random(3);
  const blocks: Block[] = [];
  let words = 0;
  const sentence = (): string => {
    const length = 8 + Math.floor(next() * 14);
    const out: string[] = [];
    for (let k = 0; k < length; k++) out.push(WORDS[Math.floor(next() * WORDS.length)]);
    out[0] = out[0][0].toUpperCase() + out[0].slice(1);
    words += length;
    return out.join(" ") + ".";
  };
  let paragraphs = 0;
  let marked = false;
  while (words < target) {
    if (paragraphs % 10 === 0) {
      const title = sentence().slice(0, -1);
      blocks.push({ type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] });
    }
    if (!marked && words >= target / 2) {
      blocks.push({ type: "paragraph", content: [{ type: "text", text: MARKER }] });
      words += 1;
      marked = true;
    }
    const content: Text[] = [];
    const sentences = 5 + Math.floor(next() * 6);
    for (let k = 0; k < sentences; k++) {
      const roll = next();
      const text = sentence() + (k < sentences - 1 ? " " : "");
      content.push(roll < 0.08 ? { type: "text", text, marks: [{ type: "bold" }] } : roll < 0.16 ? { type: "text", text, marks: [{ type: "italic" }] } : { type: "text", text });
    }
    blocks.push({ type: "paragraph", content });
    paragraphs++;
  }
  return { blocks, words };
}

export const chapter20k = () => chapter(20_000);
export const chapterTiny = () => chapter(300);

export const codeOf = (fixture: FixtureName) => (fixture === "code-long-lines" ? codeLongLines() : fixture === "code-tiny" ? codeTiny() : code1mb());
export const chapterOf = (fixture: FixtureName) => (fixture === "chapter-tiny" ? chapterTiny() : chapter20k());
