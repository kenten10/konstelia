export interface AnchorSourceDocument {
  readonly file: string;
  readonly sourceText: string;
}

export interface AnchorSourceScan {
  readonly sources: readonly AnchorSourceDocument[];
  readonly skippedFiles: number;
  readonly cancelled: boolean;
}

export interface AnchorSourceCatalog {
  scanSources(): Promise<AnchorSourceScan>;
  readSource(file: string): Promise<string | undefined>;
}
