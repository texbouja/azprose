declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  interface Options {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }
  const plugin: MarkdownIt.PluginWithOptions<Options>;
  export default plugin;
}
