import type { Margins, PageSize, PaperTheme } from '../../sard/export/html';
import type { MissingPolicy } from '../../sard/export/selection';

export type ExportFormat = 'pdf' | 'epub';

export interface ExportNovelRef {
  id: number;
  name: string;
  pluginId: string;
  author?: string | null;
  summary?: string | null;
  cover?: string | null;
  isLocal?: boolean | null;
}

export interface ExportChapterRef {
  id: number;
  name: string;
  /** 1-based position in the novel's reading order. */
  position: number;
  chapterNumber?: number | null;
  isDownloaded: boolean;
}

export interface ExportOptions {
  fontId: string;
  fontSize: number;
  lineHeight: number;
  pageSize: PageSize;
  margins: Margins;
  paperTheme: PaperTheme;
  justify: boolean;
  includeCover: boolean;
  includeToc: boolean;
  includeImages: boolean;
  includeChapterNumber: boolean;
  pageBreakPerChapter: boolean;
  /** Chapters per output file; 0 = single file (auto split for huge exports). */
  chaptersPerFile: number;
  /** EPUB only: extra reader-theme / custom CSS appended to the stylesheet. */
  epubExtraStylesheet?: string;
}

/** Payload of the `EXPORT_NOVEL` background task. JSON-serializable. */
export interface ExportNovelData {
  format: ExportFormat;
  novel: ExportNovelRef;
  chapters: ExportChapterRef[];
  missingPolicy: MissingPolicy;
  destinationUri: string;
  fileName: string;
  options: ExportOptions;
  /**
   * Chapters fetched through third-party plugins carry the personal-use
   * footer. Computed from the novel's source, never user-toggleable.
   */
  watermark: boolean;
}

export interface ExportCheckpoint {
  downloadDone: boolean;
  /** Number of output files already written (resume after process death). */
  partsDone: number;
  files: string[];
}

export const parseExportCheckpoint = (raw?: string): ExportCheckpoint => {
  try {
    const parsed = raw ? (JSON.parse(raw) as Partial<ExportCheckpoint>) : {};
    return {
      downloadDone: Boolean(parsed.downloadDone),
      partsDone: Number(parsed.partsDone) || 0,
      files: Array.isArray(parsed.files) ? parsed.files.map(String) : [],
    };
  } catch {
    return { downloadDone: false, partsDone: 0, files: [] };
  }
};

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  fontId: 'amiri',
  fontSize: 13,
  lineHeight: 1.8,
  pageSize: 'A5',
  margins: 'normal',
  paperTheme: 'white',
  justify: true,
  includeCover: true,
  includeToc: true,
  includeImages: true,
  includeChapterNumber: false,
  pageBreakPerChapter: true,
  chaptersPerFile: 0,
};
