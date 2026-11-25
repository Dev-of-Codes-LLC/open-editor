// Why is an object still alive? Take a heap snapshot through the DevTools
// protocol and print the chain of references from a garbage-collection root
// to every object whose name contains `needle`.
//
// The retention test uses this when it fails, so the failure says what holds
// the object, not only that something does. Chromium only.
import type { CDPSession } from "@playwright/test";

export async function retainerPaths(cdp: CDPSession, needle: string): Promise<string[]> {
  let text = "";
  const onChunk = (event: { chunk: string }) => {
    text += event.chunk;
  };
  cdp.on("HeapProfiler.addHeapSnapshotChunk", onChunk);
  await cdp.send("HeapProfiler.takeHeapSnapshot", { reportProgress: false });
  cdp.off("HeapProfiler.addHeapSnapshotChunk", onChunk);

  const snapshot = JSON.parse(text);
  const meta = snapshot.snapshot.meta;
  const { nodes, edges, strings } = snapshot;
  const nodeSize = meta.node_fields.length;
  const edgeSize = meta.edge_fields.length;
  const nodeType = meta.node_fields.indexOf("type");
  const nodeName = meta.node_fields.indexOf("name");
  const nodeEdges = meta.node_fields.indexOf("edge_count");
  const edgeType = meta.edge_fields.indexOf("type");
  const edgeName = meta.edge_fields.indexOf("name_or_index");
  const edgeTo = meta.edge_fields.indexOf("to_node");
  const edgeTypes: string[] = meta.edge_types[0];
  const nodeTypes: string[] = meta.node_types[0];
  const count = nodes.length / nodeSize;

  const firstEdge = new Int32Array(count + 1);
  for (let i = 0, e = 0; i < count; i++) {
    firstEdge[i] = e;
    e += nodes[i * nodeSize + nodeEdges];
    firstEdge[i + 1] = e;
  }

  // Walk out from the root over every reference that keeps its target alive,
  // and remember how each object was first reached: that is its shortest chain.
  const parent = new Int32Array(count).fill(-1);
  const via: string[] = new Array(count);
  const queue = [0];
  parent[0] = 0;
  for (let q = 0; q < queue.length; q++) {
    const from = queue[q];
    for (let k = firstEdge[from]; k < firstEdge[from + 1]; k++) {
      const type = edgeTypes[edges[k * edgeSize + edgeType]];
      if (type === "weak") continue;
      const to = edges[k * edgeSize + edgeTo] / nodeSize;
      if (parent[to] !== -1) continue;
      parent[to] = from;
      const name = edges[k * edgeSize + edgeName];
      via[to] = type === "element" || type === "hidden" ? `[${name}]` : `.${strings[name]}`;
      queue.push(to);
    }
  }

  const label = (i: number) =>
    `${nodeTypes[nodes[i * nodeSize + nodeType]]} ${String(strings[nodes[i * nodeSize + nodeName]]).slice(0, 100)}`;
  const paths: string[] = [];
  for (let i = 0; i < count; i++) {
    const type = nodeTypes[nodes[i * nodeSize + nodeType]];
    if (type === "string" || type === "code" || type === "concatenated string") continue;
    if (!String(strings[nodes[i * nodeSize + nodeName]]).includes(needle)) continue;
    if (parent[i] === -1) continue;
    const steps: string[] = [];
    for (let at = i, guard = 0; at !== 0 && guard < 80; at = parent[at], guard++) {
      steps.push(`${label(at)}\n    held through ${via[at]} by`);
    }
    paths.push(`${steps.join("\n  ")}\n  the collector's roots`);
  }
  return paths;
}
