import { invoke } from "@tauri-apps/api/core";
import { exists, readDir, remove } from "@tauri-apps/plugin-fs";
import { logStore } from "@/components/console/log.svelte";
import { latexSettings } from "@/stores/latex-settings.svelte";
import { basename, dirname } from "@/lib";

const LATEX_ARTIFACT_EXTS = new Set([".aux", ".log", ".out", ".toc", ".bbl", ".blg", ".fls", ".fdb_latexmk", ".synctex.gz", ".nav", ".snm", ".vrb"]);

/** Resolve the effective aux/out dirs: latexmkrc values override our settings store. */
async function resolveDirs(filePath: string): Promise<{ outDir: string; auxDir: string }> {
  try {
    const rc = await invoke<{ out_dir: string | null; aux_dir: string | null }>("latex_resolve_dirs", { path: filePath });
    return {
      outDir: rc.out_dir ?? latexSettings.current.outputDir,
      auxDir: rc.aux_dir ?? latexSettings.current.auxDir,
    };
  } catch {
    return {
      outDir: latexSettings.current.outputDir,
      auxDir: latexSettings.current.auxDir,
    };
  }
}

/** Remove only auxiliary files (no PDFs) for a single .tex file. */
export async function cleanLatexAux(filePath: string): Promise<void> {
  const name = basename(filePath).replace(/\.tex$/i, "");
  const { auxDir } = await resolveDirs(filePath);
  const dir = dirname(filePath);
  const auxPath = `${dir}/${auxDir}/${name}`;
  let count = 0;
  for (const ext of LATEX_ARTIFACT_EXTS) {
    const f = `${auxPath}${ext}`;
    if (await exists(f)) {
      await remove(f);
      count++;
    }
  }
  logStore.append("latex", `info: cleaned ${count} auxiliary file(s) for ${name}`);
}

/** Remove auxiliary files + PDFs for a single .tex file. */
export async function cleanLatexAuxAndOutput(filePath: string): Promise<void> {
  const name = basename(filePath).replace(/\.tex$/i, "");
  const { outDir, auxDir } = await resolveDirs(filePath);
  const dir = dirname(filePath);
  let count = 0;
  // Remove PDF from output dir
  const pdfPath = `${dir}/${outDir}/${name}.pdf`;
  if (await exists(pdfPath)) {
    await remove(pdfPath);
    count++;
  }
  // Remove auxiliary files from aux dir
  const auxPath = `${dir}/${auxDir}/${name}`;
  for (const ext of LATEX_ARTIFACT_EXTS) {
    const f = `${auxPath}${ext}`;
    if (await exists(f)) {
      await remove(f);
      count++;
    }
  }
  logStore.append("latex", `info: cleaned ${count} file(s) for ${name}`);
}

/** Remove all LaTeX artifacts (PDFs + aux files) from output and aux directories. */
export async function cleanLatexAll(filePath: string): Promise<void> {
  const dir = dirname(filePath);
  const { outDir, auxDir } = await resolveDirs(filePath);
  let count = 0;

  for (const subdir of [outDir, auxDir]) {
    const dirPath = `${dir}/${subdir}`;
    if (!await exists(dirPath)) continue;
    const entries = await readDir(dirPath);
    for (const e of entries) {
      const name = e.name?.toLowerCase() ?? "";
      if (name.endsWith(".pdf") || [...LATEX_ARTIFACT_EXTS].some((ext) => name.endsWith(ext))) {
        await remove(`${dirPath}/${e.name}`);
        count++;
      }
    }
  }

  logStore.append("latex", `info: cleaned ${count} file(s)`);
}

/** Initialize .azprose/texmf/ with TDS structure. */
export async function initTexmf(projectRoot: string): Promise<string> {
  return invoke<string>("latex_init_texmf", { projectRoot });
}

/** Run mktexlsr/texhash on .azprose/texmf/ to rebuild ls-R database. */
export async function rehashTexmf(projectRoot: string): Promise<string> {
  return invoke<string>("latex_rehash_texmf", { projectRoot });
}
