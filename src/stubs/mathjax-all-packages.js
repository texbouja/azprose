// Stub — prevents mathjax-full from calling MathJax.loader.preLoad()
// at module init, which conflicts with the mathjax/tex-svg.js component build.
// Safe because @marp-team/marp-core is used with math:false.
export const AllPackages = [];
