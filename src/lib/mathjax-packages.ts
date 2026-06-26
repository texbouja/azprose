export interface MathJaxPackage {
  id: string;
  label: string;
}

export const MATHJAX_PACKAGES: MathJaxPackage[] = [
  { id: "empheq",    label: "empheq"    },
  { id: "mathtools", label: "mathtools" },
  { id: "mhchem",   label: "mhchem"    },
  { id: "physics",   label: "physics"   },
];
