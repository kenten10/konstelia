export const supportedLanguageIds = [
  "typescript",
  "typescriptreact",
  "javascript",
  "javascriptreact",
  "python",
  "ruby",
  "rust",
  "go",
  "swift",
  "java",
  "csharp",
  "c",
  "cpp",
  "kotlin",
] as const;

export const supportedSourceGlob = "**/*.{ts,tsx,js,jsx,mjs,cjs,py,rb,rs,go,swift,java,cs,c,cc,cpp,cxx,h,hh,hpp,hxx,kt,kts}";

export function isSupportedLanguageId(languageId: string): boolean {
  return (supportedLanguageIds as readonly string[]).includes(languageId);
}

export function sourceExtension(fileName: string): string {
  const match = /\.([A-Za-z0-9]+)$/.exec(fileName);
  return match?.[1] ?? "txt";
}
