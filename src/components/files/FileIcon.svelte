<script lang="ts">
import FilePdf from "phosphor-svelte/lib/FilePdf";
import FileMd from "phosphor-svelte/lib/FileMd";
import FileCsv from "phosphor-svelte/lib/FileCsv";
import FileImage from "phosphor-svelte/lib/FileImage";
import FileZip from "phosphor-svelte/lib/FileZip";
import FileAudio from "phosphor-svelte/lib/FileAudio";
import FileVideo from "phosphor-svelte/lib/FileVideo";
import FileHtml from "phosphor-svelte/lib/FileHtml";
import FileCss from "phosphor-svelte/lib/FileCss";
import FileIni from "phosphor-svelte/lib/FileIni";
import FileSql from "phosphor-svelte/lib/FileSql";
import FilePy from "phosphor-svelte/lib/FilePy";
import FileRs from "phosphor-svelte/lib/FileRs";
import FileJs from "phosphor-svelte/lib/FileJs";
import FileJsx from "phosphor-svelte/lib/FileJsx";
import FileTs from "phosphor-svelte/lib/FileTs";
import FileTsx from "phosphor-svelte/lib/FileTsx";
import FileC from "phosphor-svelte/lib/FileC";
import FileCpp from "phosphor-svelte/lib/FileCpp";
import FileCSharp from "phosphor-svelte/lib/FileCSharp";
import FileDoc from "phosphor-svelte/lib/FileDoc";
import FileXls from "phosphor-svelte/lib/FileXls";
import FilePpt from "phosphor-svelte/lib/FilePpt";
import FileTxt from "phosphor-svelte/lib/FileTxt";
import FileText from "phosphor-svelte/lib/FileText";
import FileCode from "phosphor-svelte/lib/FileCode";
import FileVue from "phosphor-svelte/lib/FileVue";
import File from "phosphor-svelte/lib/File";

let { path, size = 13, weight = "regular" }: {
  path: string;
  size?: number;
  weight?: "thin" | "light" | "regular" | "bold" | "fill" | "duotone";
} = $props();

function fileExtension(p: string): string | null {
  const i = p.lastIndexOf(".");
  if (i <= 0) return null;
  return p.slice(i + 1).toLowerCase();
}

let ext = $derived(fileExtension(path));
</script>

{#if !ext}
  <File {size} {weight} />
{:else if ext === "pdf"}
  <FilePdf {size} {weight} />
{:else if ext === "md" || ext === "markdown" || ext === "mdx"}
  <FileMd {size} {weight} />
{:else if ext === "csv" || ext === "tsv"}
  <FileCsv {size} {weight} />
{:else if ext === "png" || ext === "jpg" || ext === "jpeg" || ext === "gif" || ext === "bmp" || ext === "webp" || ext === "ico" || ext === "svg"}
  <FileImage {size} {weight} />
{:else if ext === "zip" || ext === "tar" || ext === "gz" || ext === "7z" || ext === "rar" || ext === "bz2" || ext === "xz" || ext === "zst"}
  <FileZip {size} {weight} />
{:else if ext === "mp3" || ext === "wav" || ext === "ogg" || ext === "flac" || ext === "aac" || ext === "wma" || ext === "opus"}
  <FileAudio {size} {weight} />
{:else if ext === "mp4" || ext === "avi" || ext === "mkv" || ext === "mov" || ext === "wmv" || ext === "webm"}
  <FileVideo {size} {weight} />
{:else if ext === "html" || ext === "htm" || ext === "xhtml"}
  <FileHtml {size} {weight} />
{:else if ext === "css" || ext === "scss" || ext === "less"}
  <FileCss {size} {weight} />
{:else if ext === "ini" || ext === "cfg" || ext === "conf" || ext === "env"}
  <FileIni {size} {weight} />
{:else if ext === "sql"}
  <FileSql {size} {weight} />
{:else if ext === "py" || ext === "pyw"}
  <FilePy {size} {weight} />
{:else if ext === "rs"}
  <FileRs {size} {weight} />
{:else if ext === "js" || ext === "mjs" || ext === "cjs"}
  <FileJs {size} {weight} />
{:else if ext === "jsx"}
  <FileJsx {size} {weight} />
{:else if ext === "ts" || ext === "mts" || ext === "cts"}
  <FileTs {size} {weight} />
{:else if ext === "tsx"}
  <FileTsx {size} {weight} />
{:else if ext === "c" || ext === "h"}
  <FileC {size} {weight} />
{:else if ext === "cpp" || ext === "hpp" || ext === "cxx" || ext === "hxx" || ext === "cc" || ext === "hh"}
  <FileCpp {size} {weight} />
{:else if ext === "cs"}
  <FileCSharp {size} {weight} />
{:else if ext === "vue"}
  <FileVue {size} {weight} />
{:else if ext === "doc" || ext === "docx" || ext === "odt" || ext === "rtf"}
  <FileDoc {size} {weight} />
{:else if ext === "xls" || ext === "xlsx" || ext === "ods"}
  <FileXls {size} {weight} />
{:else if ext === "ppt" || ext === "pptx" || ext === "odp"}
  <FilePpt {size} {weight} />
{:else if ext === "txt" || ext === "text"}
  <FileTxt {size} {weight} />
{:else if ext === "json" || ext === "jsonc" || ext === "yaml" || ext === "yml" || ext === "toml" || ext === "xml"}
  <FileText {size} {weight} />
{:else}
  <FileCode {size} {weight} />
{/if}
