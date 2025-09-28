import * as cheerio from 'cheerio';
import { DfContentInfo, DfContentInfoUtils, MediaInfo, MediaInfoUtils, logger } from 'df-downloader-common';

export interface ParsedPatreonPost {
  title: string;
  description: string;
  publishedDate: Date;
  tags: string[];
  thumbnailUrl?: string;
  downloadLinks: Array<{
    url: string;
    format: string;
  }>;
}

export interface HtmlImportResult {
  postsFound: number;
  postsWithDownloads: number;
  contentInfos: DfContentInfo[];
}

/**
 * Parse Patreon HTML content and extract post information
 */
export function parsePatreonHtml(htmlContent: string): HtmlImportResult {
  const $ = cheerio.load(htmlContent);
  const contentInfos: DfContentInfo[] = [];
  let postsFound = 0;
  let postsWithDownloads = 0;

  // Find all post cards
  $('[data-tag="post-card"]').each((index, element) => {
    postsFound++;

    try {
      const post = parsePostCard($, $(element));

      if (post) {
        if (post.downloadLinks.length > 0) {
          postsWithDownloads++;

          // Create DfContentInfo from parsed post
          const contentInfo = createContentInfoFromPost(post);
          contentInfos.push(contentInfo);

          logger.log("info", `Parsed Patreon post: "${post.title}" with ${post.downloadLinks.length} download(s)`);
        } else {
          logger.log("debug", `Skipping post "${post.title}" - no download links found`);
        }
      }
    } catch (error) {
      logger.log("error", `Failed to parse post ${index + 1}: ${error}`);
    }
  });

  return {
    postsFound,
    postsWithDownloads,
    contentInfos
  };
}

/**
 * Parse a single post card element
 */
function parsePostCard($: cheerio.CheerioAPI, $postCard: cheerio.Cheerio<any>): ParsedPatreonPost | null {
  // Extract title
  const title = $postCard.find('[data-tag="post-title"] a').text().trim();
  if (!title) {
    logger.log("debug", "No title found in post card");
    return null;
  }

  // Extract published date
  const publishedDateText = $postCard.find('[data-tag="post-published-at"] span').first().text().trim();
  const publishedDate = parsePublishedDate(publishedDateText);

  // Extract description (content before download links)
  const description = extractDescription($, $postCard);

  // Extract tags
  const tags = extractTags($, $postCard);

  // Extract thumbnail
  const thumbnailUrl = extractThumbnail($, $postCard);

  // Extract download links (most important)
  const downloadLinks = extractDownloadLinks($, $postCard);

  return {
    title,
    description,
    publishedDate,
    tags,
    thumbnailUrl,
    downloadLinks
  };
}

/**
 * Extract download links and their formats from post content
 */
function extractDownloadLinks($: cheerio.CheerioAPI, $postCard: cheerio.Cheerio<any>): Array<{ url: string; format: string }> {
  const downloadLinks: Array<{ url: string; format: string }> = [];

  // Look for links with download-like URLs
  $postCard.find('a[href]').each((index, element) => {
    const href = $(element).attr('href');
    const linkText = $(element).text().toLowerCase();
    const previousText = $(element).prev().text() || $(element).parent().text();

    if (!href) return;

    // Check if this looks like a download link
    const isDownloadLink =
      href.includes('.mp4') ||
      href.includes('.mp3') ||
      href.includes('.mkv') ||
      href.includes('.avi') ||
      linkText.includes('download') ||
      $(element).attr('target') === '_blank';

    if (isDownloadLink) {
      // Try to determine format from surrounding text
      let format = 'Unknown';

      // Look for format indicators like "h.264:", "HEVC:", etc.
      const formatPatterns = [
        { pattern: /h\.?264/i, format: 'h264' },
        { pattern: /hevc/i, format: 'HEVC' },
        { pattern: /mp3/i, format: 'MP3' },
        { pattern: /audio/i, format: 'MP3' },
        { pattern: /4k/i, format: 'HEVC' },
        { pattern: /1080p/i, format: 'h264' }
      ];

      // Check surrounding text for format indicators
      const contextText = `${previousText} ${linkText}`.toLowerCase();
      for (const { pattern, format: formatName } of formatPatterns) {
        if (pattern.test(contextText)) {
          format = formatName;
          break;
        }
      }

      // If still unknown, try to infer from URL
      if (format === 'Unknown') {
        if (href.includes('hevc') || href.includes('4k')) {
          format = 'HEVC';
        } else if (href.includes('.mp3')) {
          format = 'MP3';
        } else if (href.includes('.mp4')) {
          format = 'h264';
        }
      }

      downloadLinks.push({
        url: href,
        format
      });
    }
  });

  return downloadLinks;
}

/**
 * Extract description from post content
 */
function extractDescription($: cheerio.CheerioAPI, $postCard: cheerio.Cheerio<any>): string {
  // Look for the main content area
  const contentSelectors = [
    '.cm-LIiDtl p',
    '[data-tag="post-content"] p',
    '.post-content p'
  ];

  for (const selector of contentSelectors) {
    const paragraphs = $postCard.find(selector);
    if (paragraphs.length > 0) {
      // Get all paragraph text, stopping at download links
      let description = '';
      paragraphs.each((index, element) => {
        const text = $(element).text().trim();
        // Stop if we hit download links
        if (text.toLowerCase().includes('download') && text.includes('http')) {
          return false; // break
        }
        if (text) {
          description += (description ? '\n\n' : '') + text;
        }
      });
      if (description) return description;
    }
  }

  return '';
}

/**
 * Extract tags from post
 */
function extractTags($: cheerio.CheerioAPI, $postCard: cheerio.Cheerio<any>): string[] {
  const tags: string[] = [];

  $postCard.find('[data-tag="post-tag"]').each((index, element) => {
    const tagText = $(element).text().trim();
    if (tagText) {
      tags.push(tagText);
    }
  });

  return tags;
}

/**
 * Extract thumbnail URL from post
 */
function extractThumbnail($: cheerio.CheerioAPI, $postCard: cheerio.Cheerio<any>): string | undefined {
  // Look for images in the post
  const images = $postCard.find('img[src]');

  for (let i = 0; i < images.length; i++) {
    const src = $(images[i]).attr('src');
    if (src && !src.includes('avatar') && !src.includes('profile')) {
      return src;
    }
  }

  return undefined;
}

/**
 * Parse published date from text like "September 12"
 */
function parsePublishedDate(dateText: string): Date {
  if (!dateText) return new Date();

  // Try to parse dates like "September 12"
  const currentYear = new Date().getFullYear();
  const dateStr = `${dateText} ${currentYear}`;

  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  // Fallback to current date
  return new Date();
}

/**
 * Create DfContentInfo from parsed post data
 */
function createContentInfoFromPost(post: ParsedPatreonPost): DfContentInfo {
  // Generate consistent content name
  const sanitizedTitle = post.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const contentName = `${sanitizedTitle}-manual-download`;

  // Create MediaInfo objects for each download link
  const mediaInfo: MediaInfo[] = post.downloadLinks.map((link, index) => ({
    type: determineMediaType(link.format),
    formatString: link.format,
    encoding: link.format as any, // Type assertion for now
    size: undefined,
    videoProperties: link.format !== 'MP3' ? null : null,
    audioProperties: null,
    mediaFilename: undefined,
    // Store the URL temporarily in duration field - we'll extract it later
    duration: link.url
  }));

  return DfContentInfoUtils.create(
    contentName,
    post.title,
    post.description,
    mediaInfo,
    post.thumbnailUrl || '',
    undefined, // youtubeVideoId
    post.publishedDate,
    post.tags,
    'patreon'
  );
}

/**
 * Determine media type from format string
 */
function determineMediaType(format: string): 'VIDEO' | 'AUDIO' | 'ARCHIVE' | 'UNKNOWN' {
  const lowerFormat = format.toLowerCase();

  if (lowerFormat.includes('mp3') || lowerFormat.includes('audio')) {
    return 'AUDIO';
  }

  if (lowerFormat.includes('h264') || lowerFormat.includes('hevc') ||
      lowerFormat.includes('mp4') || lowerFormat.includes('mkv')) {
    return 'VIDEO';
  }

  return 'UNKNOWN';
}