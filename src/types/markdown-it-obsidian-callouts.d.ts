declare module "markdown-it-obsidian-callouts" {
  import type MarkdownIt from "markdown-it";
  interface Options {
    langPrefix?: string;
    icons?: Record<string, string>;
  }
  const plugin: MarkdownIt.PluginWithOptions<Options>;
  export default plugin;
}
