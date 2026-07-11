import { LspClient } from "./client";

let _instance: LspClient | null = null;
let _startPromise: Promise<void> | null = null;

/** Get the shared tinymist LspClient singleton, starting it on first access. */
export function getTinymistClient(): LspClient {
  if (!_instance) {
    _instance = new LspClient({
      command: "tinymist",
      args: ["lsp"],
      languageId: "typst",
    });
  }
  return _instance;
}

/** Start tinymist (initialize handshake). Safe to call multiple times. */
export function startTinymist(): Promise<void> {
  if (!_startPromise) {
    _startPromise = getTinymistClient().start();
  }
  return _startPromise;
}

/** Stop tinymist. */
export async function stopTinymist(): Promise<void> {
  if (_instance) {
    await _instance.stop();
    _instance = null;
    _startPromise = null;
  }
}

/** True once the initialize handshake has completed. */
export function isTinymistReady(): boolean {
  return _instance !== null;
}
