import assert from "node:assert/strict";
import test from "node:test";
import type { ExtensionAPI, ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import k8sKnowledge from "../src/index.ts";

type Command = Parameters<ExtensionAPI["registerCommand"]>[1];

function register(): Map<string, Command> {
  const commands = new Map<string, Command>();
  // A narrow mock also catches accidental startup calls to other pi APIs.
  const pi = {
    registerCommand(name: string, command: Command) {
      commands.set(name, command);
    },
  } as ExtensionAPI;
  k8sKnowledge(pi);
  return commands;
}

test("registers the status command", () => {
  const commands = register();
  assert.deepEqual([...commands.keys()], ["k8s-knowledge"]);
  assert.ok(commands.get("k8s-knowledge")?.description);
});

test("status clearly identifies unimplemented retrieval", async () => {
  const notifications: string[] = [];
  const ctx = {
    hasUI: true,
    ui: { notify: (message: string) => notifications.push(message) },
  } as unknown as ExtensionCommandContext;
  await register().get("k8s-knowledge")!.handler("", ctx);
  assert.equal(notifications.length, 1);
  assert.match(notifications[0]!, /not implemented yet/);
});

test("does not access UI in headless mode", async () => {
  const ctx = { hasUI: false } as ExtensionCommandContext;
  await register().get("k8s-knowledge")!.handler("", ctx);
});
