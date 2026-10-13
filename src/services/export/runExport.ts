/**
 * Background executor for the `EXPORT_NOVEL` task (PDF + EPUB).
 *
 * Phases: (1) optionally download missing chapters through the regular
 * download service, (2) read + clean each chapter, (3) render each output
 * part (expo-print for PDF, nitro-epub for EPUB), (4) copy to the SAF folder
 * the user picked. Progress goes through the task queue, which drives the
 * foreground-service notification, and the checkpoint lets an interrupted
 * export resume at the next unwritten part.
 */
import * as Print from 'expo-print';
import * as LegacyFS from 'expo-file-system/legacy';

import NativeFile from '@modules/native-file';
import { epub, type EpubExportChapter } from '@modules/nitro-epub';
import { getChapter } from '@database/queries/ChapterQueries';
import { downloadChapters } from '@services/download/downloadChapter';
import { NOVEL_STORAGE } from '@utils/Storages';
import type {
  BackgroundTaskExecutionContext,
  TaskProgressUpdater,
} from '@services/backgroundTasks/contracts';

import {
  PAGE_SIZES,
  buildEpubStylesheet,
  buildPdfHtml,
  cleanChapterHtml,
  detectDirection,
  rewriteImages,
  toDataUri,
  wrapEpubChapter,
  mimeFromBase64,
  type PdfChapterInput,
} from '../../sard/export/html';
import { partFileName, splitIntoParts } from '../../sard/export/selection';
import { exportStrings, fmt } from '../../sard/export/strings';
import { fontFaceCss, getExportFont } from '../../sard/export/fonts';
import {
  parseExportCheckpoint,
  type ExportChapterRef,
  type ExportCheckpoint,
  type ExportNovelData,
} from './contracts';

const MAX_IMAGE_CHARS_PER_PART = 60 * 1024 * 1024; // base64 chars
const MAX_SINGLE_IMAGE_CHARS = 8 * 1024 * 1024;

const stripScheme = (path: string) => path.replace(/^file:\/\//, '');

export const chapterHtmlPath = (
  pluginId: string,
  novelId: number,
  chapterId: number,
) => `${NOVEL_STORAGE}/${pluginId}/${novelId}/${chapterId}/index.html`;

export const chapterTitle = (
  chapter: ExportChapterRef,
  includeNumber: boolean,
): string => {
  const name = chapter.name?.trim();
  const numbered = fmt(exportStrings.chapterLabel, {
    num: chapter.chapterNumber ?? chapter.position,
  });
  if (!name) return numbered;
  return includeNumber ? `${numbered} — ${name}` : name;
};

const readBase64 = async (uri: string): Promise<string | undefined> => {
  try {
    const fileUri = uri.startsWith('file://') ? uri : `file://${uri}`;
    return await LegacyFS.readAsStringAsync(fileUri, {
      encoding: LegacyFS.EncodingType.Base64,
    });
  } catch {
    return undefined;
  }
};

/** Resolves an image src to a data: URI (downloaded .b64 files, local files, http). */
const createImageResolver = () => {
  let budget = MAX_IMAGE_CHARS_PER_PART;
  const cache = new Map<string, string | undefined>();
  const accept = (dataUri: string | undefined) => {
    if (
      !dataUri ||
      dataUri.length > MAX_SINGLE_IMAGE_CHARS ||
      dataUri.length > budget
    ) {
      return undefined;
    }
    budget -= dataUri.length;
    return dataUri;
  };
  const resolve = async (src: string): Promise<string | undefined> => {
    if (cache.has(src)) return cache.get(src);
    let result: string | undefined;
    if (src.startsWith('data:image/')) {
      result = accept(src);
    } else if (src.startsWith('file://') || src.startsWith('/')) {
      const path = stripScheme(decodeURI(src));
      if (/\.b64\.[a-z]+$/i.test(path)) {
        // LNReader stores downloaded chapter images as base64 text.
        try {
          result = accept(toDataUri(await NativeFile.readFile(path)));
        } catch {
          result = undefined;
        }
      } else {
        const b64 = await readBase64(path);
        const mime = b64 ? mimeFromBase64(b64) : undefined;
        result = b64 && mime ? accept(`data:${mime};base64,${b64}`) : undefined;
      }
    } else if (/^https?:\/\//i.test(src)) {
      const tmp = `${LegacyFS.cacheDirectory}sard-img-${Date.now()}-${
        cache.size
      }`;
      try {
        const res = await LegacyFS.downloadAsync(src, tmp);
        if (res.status >= 200 && res.status < 300) {
          const b64 = await readBase64(tmp);
          const mime = b64 ? mimeFromBase64(b64) : undefined;
          result =
            b64 && mime ? accept(`data:${mime};base64,${b64}`) : undefined;
        }
      } catch {
        result = undefined;
      } finally {
        LegacyFS.deleteAsync(tmp, { idempotent: true }).catch(() => undefined);
      }
    }
    cache.set(src, result);
    return result;
  };
  return { resolve, reset: () => (budget = MAX_IMAGE_CHARS_PER_PART) };
};

const ensureDownloaded = async (
  data: ExportNovelData,
  updateProgress: TaskProgressUpdater,
): Promise<ExportChapterRef[]> => {
  const missing = data.chapters.filter(c => !c.isDownloaded);
  if (
    missing.length &&
    data.missingPolicy === 'download' &&
    !data.novel.isLocal
  ) {
    await downloadChapters(
      {
        novelName: data.novel.name,
        chapters: missing.map(c => ({ chapterId: c.id, chapterName: c.name })),
      },
      transform =>
        updateProgress(meta => {
          const next = transform(meta);
          return {
            ...next,
            isRunning: true,
            progress: (next.progress ?? 0) * 0.35,
            progressText: `${fmt(exportStrings.stepDownloading, {
              current: Math.min(
                missing.length,
                Math.round((next.progress ?? 0) * missing.length) + 1,
              ),
              total: missing.length,
            })} · ${next.progressText ?? ''}`,
          };
        }),
      { checkpoint: undefined, updateCheckpoint: async () => undefined },
    );
  }
  // Re-read download state: the source of truth is the database.
  const refreshed: ExportChapterRef[] = [];
  for (const chapter of data.chapters) {
    const row = await getChapter(chapter.id);
    refreshed.push({ ...chapter, isDownloaded: Boolean(row?.isDownloaded) });
  }
  return refreshed;
};

const coverDataUri = async (cover?: string | null) => {
  if (!cover) return undefined;
  const resolver = createImageResolver();
  const clean = cover.split('?')[0];
  return resolver.resolve(/^https?:/i.test(cover) ? cover : clean);
};

export const exportNovel = async (
  data: ExportNovelData,
  updateProgress: TaskProgressUpdater,
  context?: BackgroundTaskExecutionContext,
) => {
  const checkpoint: ExportCheckpoint = parseExportCheckpoint(
    context?.checkpoint,
  );
  const saveCheckpoint = async () => {
    await context?.updateCheckpoint(JSON.stringify(checkpoint));
  };
  const formatLabel = data.format === 'pdf' ? 'PDF' : 'EPUB';

  updateProgress(meta => ({
    ...meta,
    name: fmt(exportStrings.taskTitle, {
      format: formatLabel,
      novel: data.novel.name,
    }),
    isRunning: true,
    progress: 0,
    progressText: exportStrings.loadingChapters,
  }));

  try {
    let chapters = data.chapters;
    if (!checkpoint.downloadDone) {
      chapters = await ensureDownloaded(data, updateProgress);
      checkpoint.downloadDone = true;
      await saveCheckpoint();
    } else {
      chapters = await ensureDownloaded(
        { ...data, missingPolicy: 'skip' },
        updateProgress,
      );
    }

    const exportable = chapters.filter(c => c.isDownloaded);
    const skipped = chapters.length - exportable.length;
    if (!exportable.length) {
      throw new Error(exportStrings.noDownloaded);
    }

    const parts = splitIntoParts(exportable, data.options.chaptersPerFile);
    const watermark = data.watermark ? exportStrings.watermark : undefined;
    const cover = data.options.includeCover
      ? await coverDataUri(data.novel.cover)
      : undefined;
    let chaptersDone = parts
      .slice(0, checkpoint.partsDone)
      .reduce((n, p) => n + p.length, 0);
    const total = exportable.length;
    const progressBase = data.missingPolicy === 'download' ? 0.35 : 0;
    const progressSpan = 0.97 - progressBase;

    for (
      let partIndex = checkpoint.partsDone;
      partIndex < parts.length;
      partIndex++
    ) {
      const part = parts[partIndex];
      const partLabel =
        parts.length > 1
          ? fmt(exportStrings.partSuffix, { part: partIndex + 1 })
          : undefined;
      const resolver = createImageResolver();
      const prepared: PdfChapterInput[] = [];
      const epubChapters: EpubExportChapter[] = [];
      const tempDir = `${
        NativeFile.ExternalCachesDirectoryPath
      }/sard-export-${Date.now()}`;
      if (data.format === 'epub') {
        await NativeFile.mkdir(tempDir);
      }

      try {
        let direction: 'rtl' | 'ltr' | undefined;
        for (const chapter of part) {
          const title = chapterTitle(
            chapter,
            data.options.includeChapterNumber,
          );
          chaptersDone += 1;
          updateProgress(meta => ({
            ...meta,
            isRunning: true,
            progress:
              progressBase + (chaptersDone / total) * progressSpan * 0.8,
            progressText: fmt(exportStrings.stepReading, {
              current: chaptersDone,
              total,
              chapter: title,
            }),
          }));

          const path = chapterHtmlPath(
            data.novel.pluginId,
            data.novel.id,
            chapter.id,
          );
          let raw = '';
          try {
            raw = await NativeFile.readFile(path);
          } catch {
            raw = '';
          }
          direction ??= raw ? detectDirection(`${title} ${raw}`) : undefined;

          if (data.format === 'pdf') {
            const cleaned = raw
              ? cleanChapterHtml(raw, chapter.name)
              : undefined;
            prepared.push({
              title,
              position: chapter.position,
              html: cleaned
                ? await rewriteImages(
                    cleaned,
                    resolver.resolve,
                    data.options.includeImages,
                  )
                : undefined,
            });
          } else {
            const htmlPath = `${tempDir}/${chapter.id}.html`;
            let body =
              raw || `<p>${exportStrings.missingChapterPlaceholder}</p>`;
            if (!data.options.includeImages) {
              body = body.replace(/<img\b[^>]*>/gi, '');
            }
            await NativeFile.writeFile(
              htmlPath,
              wrapEpubChapter(body, title, direction ?? 'rtl'),
            );
            epubChapters.push({
              title,
              htmlPath,
              novelId: String(data.novel.id),
              chapterId: String(chapter.id),
            });
          }
        }

        const baseName = partFileName(
          data.fileName,
          partIndex + 1,
          parts.length,
          p => fmt(exportStrings.partSuffix, { part: p }),
        );

        let outputPath: string;
        let mime: string;
        let outName: string;
        if (data.format === 'pdf') {
          updateProgress(meta => ({
            ...meta,
            progress:
              progressBase + (chaptersDone / total) * progressSpan * 0.9,
            progressText:
              parts.length > 1
                ? fmt(exportStrings.stepRenderingPart, {
                    part: partIndex + 1,
                    parts: parts.length,
                  })
                : exportStrings.stepRendering,
          }));
          const size = PAGE_SIZES[data.options.pageSize];
          const html = buildPdfHtml({
            title: data.novel.name,
            author: data.novel.author ?? undefined,
            summary:
              partIndex === 0 ? data.novel.summary ?? undefined : undefined,
            coverUri: cover,
            partLabel,
            chapters: prepared,
            options: {
              fontId: data.options.fontId,
              fontSize: data.options.fontSize,
              lineHeight: data.options.lineHeight,
              pageSize: data.options.pageSize,
              margins: data.options.margins,
              paperTheme: data.options.paperTheme,
              justify: data.options.justify,
              includeCover: data.options.includeCover,
              includeToc: data.options.includeToc,
              pageBreakPerChapter: data.options.pageBreakPerChapter,
              watermark,
              direction,
            },
          });
          const result = await Print.printToFileAsync({
            html,
            width: size.width,
            height: size.height,
            base64: false,
          });
          outputPath = stripScheme(result.uri);
          mime = 'application/pdf';
          outName = `${baseName}.pdf`;
        } else {
          updateProgress(meta => ({
            ...meta,
            progress:
              progressBase + (chaptersDone / total) * progressSpan * 0.9,
            progressText: exportStrings.stepEpub,
          }));
          const dir = direction ?? 'rtl';
          const outFile = `${tempDir}/out.epub`;
          const watermarkCss = watermark
            ? `\nbody::after { content: "${watermark}"; display: block; text-align: center; font-size: 0.7em; opacity: 0.6; margin-top: 2em; }`
            : '';
          // Embed the chosen font in the EPUB (the native exporter copies any
          // local url(...) in the stylesheet into EPUB/fonts/).
          const embeddedFontCss = await prepareEmbeddedFontCss(
            data.options.fontId,
            tempDir,
          );
          const result = await epub.exportEpub(
            {
              title: partLabel
                ? `${data.novel.name} - ${partLabel}`
                : data.novel.name,
              language: dir === 'rtl' ? 'ar' : 'en',
              coverPath: data.options.includeCover
                ? data.novel.cover || ''
                : '',
              description: data.novel.summary || '',
              author: data.novel.author || '',
              bookId: `urn:sard:${data.novel.pluginId}:${data.novel.id}:${
                partIndex + 1
              }`,
              stylesheet:
                embeddedFontCss +
                buildEpubStylesheet(
                  data.options.fontId,
                  dir,
                  data.options.justify,
                ) +
                watermarkCss +
                (data.options.epubExtraStylesheet ?? ''),
              javascript: '',
            },
            epubChapters,
            outFile,
            async () => undefined,
          );
          outputPath = result.outputPath;
          mime = 'application/epub+zip';
          outName = `${baseName}.epub`;
        }

        updateProgress(meta => ({
          ...meta,
          progress: progressBase + (chaptersDone / total) * progressSpan,
          progressText: exportStrings.stepSaving,
        }));
        const copy = await NativeFile.copyFileToDirectory(
          outputPath,
          data.destinationUri,
          outName,
          mime,
          true,
        );
        if (copy.size <= 0) {
          throw new Error('Exported file is empty');
        }
        try {
          await NativeFile.unlink(outputPath);
        } catch {
          // best effort
        }
        checkpoint.partsDone = partIndex + 1;
        checkpoint.files.push(outName);
        await saveCheckpoint();
      } finally {
        if (data.format === 'epub') {
          try {
            if (await NativeFile.exists(tempDir))
              await NativeFile.unlink(tempDir);
          } catch {
            // cleanup must not mask the real result
          }
        }
      }
    }

    const files = checkpoint.files.join('، ');
    const completionText = skipped
      ? fmt(exportStrings.doneSkipped, { count: exportable.length, skipped })
      : fmt(exportStrings.done, { count: exportable.length, files });
    updateProgress(meta => ({
      ...meta,
      isRunning: false,
      progress: 1,
      progressText: completionText,
      completionText,
    }));
  } catch (error) {
    updateProgress(meta => ({
      ...meta,
      isRunning: false,
      progressText: fmt(exportStrings.failed, {
        error: error instanceof Error ? error.message : String(error),
      }),
    }));
    throw error;
  }
};

/**
 * Copies the export font files bundled in the APK assets into the export's
 * temp folder and returns @font-face rules pointing at them. Returns '' when
 * the platform can't copy assets, so the EPUB falls back to reader fonts.
 */
export const prepareEmbeddedFontCss = async (
  fontId: string | undefined,
  tempDir: string,
): Promise<string> => {
  if (!NativeFile.copyAssetToFile) return '';
  const font = getExportFont(fontId);
  const fontDir = `${tempDir}/fonts`;
  try {
    await NativeFile.mkdir(fontDir);
    const files = [font.file, font.boldFile].filter(Boolean) as string[];
    for (const file of files) {
      await NativeFile.copyAssetToFile(
        `fonts/${file}.ttf`,
        `${fontDir}/${file}.ttf`,
      );
    }
    return fontFaceCss(font, `file://${fontDir}`) + '\n';
  } catch {
    return '';
  }
};
