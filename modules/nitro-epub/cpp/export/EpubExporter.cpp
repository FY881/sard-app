#include "EpubExporter.hpp"

#include "EpubAsset.hpp"
#include "EpubContentProcessor.hpp"
#include "EpubDocuments.hpp"
#include "ZipWriter.hpp"

#include <cctype>
#include <filesystem>
#include <stdexcept>
#include <unordered_map>

namespace margelo::nitro::nitroepub {

namespace {

std::string fontMediaType(const std::string& extension) {
  if (extension == ".otf") return "font/otf";
  if (extension == ".woff") return "font/woff";
  if (extension == ".woff2") return "font/woff2";
  return "font/ttf";
}

// Copies every local font referenced by url(...) in the stylesheet into
// EPUB/fonts/ and rewrites the reference, so readers render the exact font
// the user chose (Arabic shaping depends on it). Remote/unknown urls are kept.
std::string embedStylesheetFonts(const std::string& css,
                                 ZipWriter& zip,
                                 std::vector<EpubAsset>& assets) {
  std::string out;
  out.reserve(css.size());
  std::unordered_map<std::string, std::string> embedded;
  std::size_t pos = 0;
  while (true) {
    const std::size_t start = css.find("url(", pos);
    if (start == std::string::npos) {
      out.append(css, pos, std::string::npos);
      break;
    }
    const std::size_t end = css.find(')', start + 4);
    if (end == std::string::npos) {
      out.append(css, pos, std::string::npos);
      break;
    }
    out.append(css, pos, start - pos);
    std::string inner = css.substr(start + 4, end - start - 4);
    while (!inner.empty() && std::isspace(static_cast<unsigned char>(inner.front()))) inner.erase(0, 1);
    while (!inner.empty() && std::isspace(static_cast<unsigned char>(inner.back()))) inner.pop_back();
    if (inner.size() >= 2 && (inner.front() == '"' || inner.front() == '\'') &&
        inner.back() == inner.front()) {
      inner = inner.substr(1, inner.size() - 2);
    }
    std::string replacement = css.substr(start, end - start + 1);
    const std::filesystem::path local = localPathFromUri(inner);
    if (!local.empty() && std::filesystem::is_regular_file(local)) {
      std::string extension = local.extension().string();
      for (char& c : extension) c = static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
      if (extension == ".ttf" || extension == ".otf" || extension == ".woff" ||
          extension == ".woff2") {
        auto found = embedded.find(local.string());
        if (found == embedded.end()) {
          const std::string name =
              "font-" + std::to_string(embedded.size()) + extension;
          const std::string archivePath = "EPUB/fonts/" + name;
          zip.addFile(archivePath, local);
          assets.push_back(EpubAsset{
              "font-" + std::to_string(embedded.size()), archivePath,
              fontMediaType(extension)});
          found = embedded.emplace(local.string(), "fonts/" + name).first;
        }
        replacement = "url(\"" + found->second + "\")";
      }
    }
    out += replacement;
    pos = end + 1;
  }
  return out;
}

} // namespace

EpubArchiveResult exportEpubArchive(
    const EpubArchiveMetadata& metadata,
    const std::vector<EpubArchiveChapter>& chapters,
    const std::string& outputPath,
    std::function<void(std::size_t, std::size_t, const std::string&)>
        onProgress) {
  if (metadata.title.empty()) {
    throw std::runtime_error("EPUB title cannot be empty");
  }
  if (outputPath.empty()) {
    throw std::runtime_error("EPUB output path cannot be empty");
  }

  std::vector<EpubArchiveChapter> availableChapters;
  availableChapters.reserve(chapters.size());
  for (const EpubArchiveChapter& chapter : chapters) {
    if (std::filesystem::is_regular_file(chapter.htmlPath)) {
      availableChapters.push_back(chapter);
    }
  }
  if (availableChapters.empty()) {
    throw std::runtime_error("EPUB requires at least one downloaded chapter");
  }

  const std::filesystem::path finalPath(outputPath);
  const std::filesystem::path temporaryPath = finalPath.string() + ".tmp";
  if (!finalPath.parent_path().empty()) {
    std::filesystem::create_directories(finalPath.parent_path());
  }
  std::error_code ignored;
  std::filesystem::remove(temporaryPath, ignored);

  try {
    ZipWriter zip(temporaryPath);

    // EPUB requires this exact file to be the first entry and uncompressed.
    zip.addStored("mimetype", "application/epub+zip");
    zip.addDeflated("META-INF/container.xml", containerDocument());

    const bool hasJavaScript = !metadata.javascript.empty();
    if (hasJavaScript) {
      zip.addDeflated("EPUB/script.js",
                      "function fnEpub(){\n" + metadata.javascript + "\n}\n");
    }

    std::vector<EpubAsset> assets;
    std::unordered_map<std::string, EpubAsset> knownAssets;
    zip.addDeflated("EPUB/styles.css",
                    embedStylesheetFonts(metadata.stylesheet, zip, assets));
    EpubAsset cover;
    EpubAsset* coverPointer = nullptr;
    const std::filesystem::path coverPath =
        localPathFromUri(metadata.coverPath);
    if (!coverPath.empty() && std::filesystem::is_regular_file(coverPath)) {
      const std::string extension = normalizedImageExtension(coverPath);
      cover = EpubAsset{
          "cover-image",
          "EPUB/images/cover" + extension,
          imageMediaType(extension),
      };
      zip.addFile(cover.archivePath, coverPath);
      coverPointer = &cover;
    }

    for (std::size_t index = 0; index < availableChapters.size(); ++index) {
      const std::string body = prepareChapterBody(
          availableChapters[index], zip, knownAssets, assets);
      zip.addDeflated(
          "EPUB/text/chapter-" + std::to_string(index) + ".xhtml",
          chapterDocument(availableChapters[index], body, hasJavaScript,
                          metadata.language));
      if (onProgress) {
        onProgress(index + 1,
                   availableChapters.size(),
                   availableChapters[index].title);
      }
    }

    zip.addDeflated(
        "EPUB/nav.xhtml",
        navigationDocument(metadata, availableChapters));
    zip.addDeflated("EPUB/toc.ncx", ncxDocument(metadata, availableChapters));
    zip.addDeflated(
        "EPUB/content.opf",
        packageDocument(metadata, availableChapters, assets, coverPointer,
                        hasJavaScript));
    zip.finish();

    std::filesystem::remove(finalPath, ignored);
    std::filesystem::rename(temporaryPath, finalPath);
    return EpubArchiveResult{outputPath, availableChapters.size()};
  } catch (...) {
    std::filesystem::remove(temporaryPath, ignored);
    throw;
  }
}

} // namespace margelo::nitro::nitroepub
