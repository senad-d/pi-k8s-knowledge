import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/** Register extension capabilities without startup I/O or background resources. */
export default function k8sKnowledge(pi: ExtensionAPI): void {
  pi.registerCommand("k8s-knowledge", {
    description: "Show Kubernetes knowledge extension status",
    handler: async (_args, ctx) => {
      if (ctx.hasUI) {
        ctx.ui.notify(
          "Kubernetes knowledge: development skeleton loaded. Knowledge retrieval is not implemented yet.",
          "info",
        );
      }
    },
  });
}
