import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type, type Static } from "typebox";
import { join } from "node:path";
import { homedir } from "node:os";
import { fetchPage, validateInput, validateRequest } from "./retrieval.ts";
import { createCache, startCache, disposeCache, parseOrReuse, selectEvidence, serializeEvidence,
  discoverCandidates, type Cache, type Evidence } from "./evidence.ts";

const schema = Type.Object({
  url: Type.Optional(Type.String({ minLength: 1, maxLength: 2048, description: "Optional: search only this official documentation page instead of discovering pages." })),
  question: Type.String({ minLength: 1, maxLength: 4096 }),
  version: Type.Optional(Type.String({ minLength: 1, maxLength: 32, description: "Put explicit version requests here. Only omitted or latest is supported." })),
}, { additionalProperties: false });
export type K8sKnowledgeInput = Static<typeof schema>;

const DOCS = "https://kubernetes.io/docs/";

async function discover(cache: Cache, question: string, signal: AbortSignal): Promise<string[]> {
  const document = await fetchPage(DOCS, signal);
  if (cache.closed || signal.aborted) throw new Error("Cancelled.");
  parseOrReuse(cache, document.url, document.html);
  return discoverCandidates(document.url, document.html, question);
}

async function retrieve(cache: Cache, url: string, question: string, signal: AbortSignal): Promise<Evidence> {
  const document = await fetchPage(url, signal);
  if (cache.closed || signal.aborted) throw new Error("Cancelled.");
  // No page reference crosses a network await; publication/selection are synchronous.
  return selectEvidence(parseOrReuse(cache, document.url, document.html), question);
}

/** Register capabilities without startup I/O or background resources. */
export default function k8sKnowledge(pi: ExtensionAPI): void {
  const cache = createCache();
  // Explicit user location, independent of project cwd and Pi branding/config overrides.
  const directory = join(homedir(), ".pi", ".k8s-knowledge");
  const active = new Set<AbortController>();
  pi.on("session_start", () => startCache(cache, directory));
  pi.registerTool({
    name: "k8s_knowledge",
    label: "Kubernetes documentation",
    description: "Use first whenever you need Kubernetes knowledge. Pass a question to retrieve verbatim excerpts " +
      "with source/section links from official English kubernetes.io/docs only (latest stable). " +
      "Up to 5 excerpts (1,200 bytes/80 lines each); 16 KiB/1,000 lines total.",
    parameters: schema,
    prepareArguments: validateInput,
    async execute(_toolCallId, raw, signal) {
      const request = validateRequest(raw);
      if (cache.closed || signal?.aborted) throw new Error("Cancelled.");
      if (!request.supported) return { content: [{ type: "text", text: JSON.stringify({
        status: "unsupported_version",
        message: "Only latest stable documentation is supported; explicit release selectors are unsupported.",
      }) }], details: {} };
      startCache(cache, directory);
      const controller = new AbortController();
      active.add(controller);
      const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 30_000);
      try {
        const urls = request.url ? [request.url] : await discover(cache, request.question, combined);
        let result: Evidence = { status: "no_evidence", sourceUrl: request.url ?? DOCS, message: "No relevant evidence found." };
        // Search the bounded shortlist in stable rank order, stopping at the first evidence page.
        for (const url of urls) {
          const found = await retrieve(cache, url, request.question, combined);
          if (request.url || found.status === "evidence") { result = found; break; }
        }
        if (cache.closed || combined.aborted) throw new Error("Cancelled.");
        return { content: [{ type: "text", text: serializeEvidence(result) }], details: {} };
      } catch (error) {
        if (timedOut) throw new Error("Timeout.");
        throw error;
      } finally {
        clearTimeout(timer);
        active.delete(controller);
      }
    },
  });
  pi.on("session_shutdown", () => {
    disposeCache(cache);
    for (const controller of active) controller.abort();
    active.clear();
  });
  pi.registerCommand("k8s-knowledge", {
    description: "Show Kubernetes knowledge extension status",
    handler: async (_args, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify("Kubernetes knowledge: k8s_knowledge discovers official English documentation evidence for a question.", "info");
      }
    },
  });
}
