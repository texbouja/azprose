import { Marp } from "@marp-team/marp-core";

export type MarpTheme = "default" | "gaia" | "uncover";
export type MarpSize  = "16:9" | "4:3" | "1:1";

export interface MarpRenderResult {
  html: string;
  css:  string;
  slideCount: number;
}

let instance: Marp | null = null;

function getInstance(): Marp {
  if (!instance) {
    instance = new Marp({ html: false, math: false });
  }
  return instance;
}

export function renderMarp(source: string): MarpRenderResult {
  const { html, css } = getInstance().render(source);
  const slideCount = (html.match(/<section/g) ?? []).length;
  return { html, css, slideCount };
}
