import { LspClient } from "./client";

let client: LspClient | null = null;

/**
 * Test LSP connection to tinymist using LspClient.
 * Call from browser console: `import('/src/lib/lsp/test.ts').then(m => m.testTinymist())`
 */
export async function testTinymist() {
  console.log("azprose:lsp:test — spawning tinymist...");

  client = new LspClient({
    command: "tinymist",
    args: ["lsp"],
    languageId: "typst",
  });

  client.onDiagnostics = (uri, diagnostics) => {
    console.log("azprose:lsp:test diagnostics", { uri, count: diagnostics.length, diagnostics });
  };
  client.onNotification = (msg) => {
    console.log("azprose:lsp:test notification", msg.method);
  };

  // start() sends initialize — wait up to 15s for tinymist to compute capabilities
  const timeout = new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 15000));
  const initialized = client.start().then(() => "ok" as const);

  const result = await Promise.race([initialized, timeout]);
  if (result === "timeout") {
    console.error("azprose:lsp:test — init TIMEOUT (15s)");
    await client.stop();
    return;
  }

  console.log("azprose:lsp:test — initialized ✓");

  // Open a virtual file to trigger diagnostics
  await client.openFile("/tmp/test.typ", "# Hello\nThis is a test.");
  console.log("azprose:lsp:test — didOpen ✓");

  // Wait 3s for diagnostics
  await new Promise((r) => setTimeout(r, 3000));

  console.log("azprose:lsp:test — shutting down...");
  await client.stop();
  console.log("azprose:lsp:test — done");
}

export async function stopTest() {
  client?.stop();
}
