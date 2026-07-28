<script lang="ts">
let { path, size = 13 }: {
  path: string;
  size?: number;
} = $props();

function fileExtension(p: string): string | null {
  const i = p.lastIndexOf(".");
  if (i <= 0) return null;
  return p.slice(i + 1).toLowerCase();
}

let ext = $derived(fileExtension(path));

let iconClass = $derived.by(() => {
  if (!ext) return "wxi-file-generic";
  if (ext === "pdf") return "wxi-file-pdf";
  if (ext === "md" || ext === "markdown" || ext === "mdx") return "wxi-file-md";
  if (ext === "csv" || ext === "tsv") return "wxi-file-csv";
  if (ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "bmp" || ext === "webp" || ext === "ico" || ext === "svg") return "wxi-file-image";
  if (ext === "zip" || ext === "tar" || ext === "gz" || ext === "7z" || ext === "rar" || ext === "bz2" || ext === "xz" || ext === "zst") return "wxi-file-zip";
  if (ext === "mp3" || ext === "wav" || ext === "ogg" || ext === "flac" || ext === "aac" || ext === "wma" || ext === "opus") return "wxi-file-audio";
  if (ext === "mp4" || ext === "avi" || ext === "mkv" || ext === "mov" || ext === "wmv" || ext === "webm") return "wxi-file-video";
  if (ext === "html" || ext === "htm" || ext === "xhtml") return "wxi-file-html";
  if (ext === "css" || ext === "scss" || ext === "less") return "wxi-file-css";
  if (ext === "ini" || ext === "cfg" || ext === "conf" || ext === "env") return "wxi-file-ini";
  if (ext === "sql") return "wxi-file-sql";
  if (ext === "py" || ext === "pyw") return "wxi-file-py";
  if (ext === "rs") return "wxi-file-rs";
  if (ext === "js" || ext === "mjs" || ext === "cjs") return "wxi-file-js";
  if (ext === "jsx") return "wxi-file-jsx";
  if (ext === "ts" || ext === "mts" || ext === "cts") return "wxi-file-ts";
  if (ext === "tsx") return "wxi-file-tsx";
  if (ext === "c" || ext === "h") return "wxi-file-c";
  if (ext === "cpp" || ext === "hpp" || ext === "cxx" || ext === "hxx" || ext === "cc" || ext === "hh") return "wxi-file-cpp";
  if (ext === "cs") return "wxi-file-csharp";
  if (ext === "vue") return "wxi-file-vue";
  if (ext === "doc" || ext === "docx" || ext === "odt" || ext === "rtf") return "wxi-file-doc";
  if (ext === "xls" || ext === "xlsx" || ext === "ods") return "wxi-file-xls";
  if (ext === "ppt" || ext === "pptx" || ext === "odp") return "wxi-file-ppt";
  if (ext === "txt" || ext === "text") return "wxi-file-txt";
  if (ext === "json" || ext === "jsonc" || ext === "yaml" || ext === "yml" || ext === "toml" || ext === "xml") return "wxi-file-text-ph";
  return "wxi-file-code";
});
</script>

<i class={iconClass} style="font-size:{size}px"></i>
