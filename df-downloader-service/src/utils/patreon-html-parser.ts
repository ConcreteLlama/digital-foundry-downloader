import * as cheerio from 'cheerio';
import { DfContentInfo, DfContentInfoUtils, MediaInfo, MediaInfoUtils, logger, createMediaInfoFromFormatString } from 'df-downloader-common';

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

  // Extract published date - try multiple selectors and approaches
  let publishedDateText = '';

  // Try various selectors for date information
  const dateSelectors = [
    '[data-tag="post-published-at"] time',
    '[data-tag="post-published-at"] span',
    '[data-tag="post-published-at"]',
    'time[datetime]',
    'time',
    '[datetime]',
    '.publish-date',
    '.post-date',
    '[data-testid="post-published-at"]',
    '.post-metadata time'
  ];

  for (const selector of dateSelectors) {
    const dateElement = $postCard.find(selector).first();
    if (dateElement.length > 0) {
      // Try datetime attribute first
      publishedDateText = dateElement.attr('datetime') || dateElement.text().trim();
      if (publishedDateText) {
        logger.log("debug", `Found date "${publishedDateText}" using selector "${selector}"`);
        break;
      }
    }
  }

  // If no specific date element found, look for date patterns in the overall text
  if (!publishedDateText) {
    const allText = $postCard.text();
    logger.log("debug", `Looking for date patterns in text: "${allText.substring(0, 200)}..."`);

    const datePatterns = [
      /published[:\s]+([^\.]+)/i,
      /posted[:\s]+([^\.]+)/i,
      /(\d+\s+(?:hours?|days?|weeks?|months?)\s+ago)/i, // "4 days ago" - moved higher priority
      /(\w+\s+\d{1,2},?\s+\d{4})/i,     // "September 12, 2024"
      /(\d{1,2}\s+\w+\s+\d{4})/i,       // "12 September 2024"
      /(\w+\s+\d{1,2})/i,               // "September 12"
      /(\d{1,2}\s+\w+)/i                // "12 September"
    ];

    for (const pattern of datePatterns) {
      const match = allText.match(pattern);
      if (match) {
        publishedDateText = match[1].trim();
        logger.log("debug", `Found date "${publishedDateText}" using pattern matching in text`);
        break;
      }
    }
  }

  // If still no date found, check if we can extract from outside the post card (like page-level date info)
  if (!publishedDateText) {
    logger.log("debug", "No date found in post card, will use current date");
  }

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

    if (!href) return;

    // Check if this looks like a download link - be more specific to avoid false positives
    const isDownloadLink =
      // Must have media file extension
      (href.includes('.mp4') || href.includes('.mp3') || href.includes('.mkv') || href.includes('.avi')) &&
      // Must have download indicators
      (linkText.includes('download') || $(element).attr('target') === '_blank') &&
      // Must NOT be a Patreon internal link
      !href.includes('patreon.com') &&
      // Must be an external CDN or direct file link
      (href.startsWith('http://') || href.startsWith('https://'));

    if (isDownloadLink) {
      let format = 'Unknown';

      // Look at the HTML structure to find the format text immediately before this specific link
      const $parentParagraph = $(element).closest('p');
      const paragraphHtml = $parentParagraph.html() || '';

      logger.log("debug", `Processing link with text: "${$(element).text()}" in paragraph HTML: "${paragraphHtml}"`);

      // Get the link's HTML to find its position in the paragraph
      const linkHtml = $(element).prop('outerHTML') || '';
      const linkIndex = paragraphHtml.indexOf(linkHtml);

      if (linkIndex > 0) {
        // Get everything before this specific link in the HTML
        const beforeLinkHtml = paragraphHtml.substring(0, linkIndex);

        // Convert HTML back to text for the part before this link, preserving line breaks
        const beforeLinkText = $('<div>')
          .html(beforeLinkHtml.replace(/<br\s*\/?>/gi, '\n'))
          .text()
          .trim();

        logger.log("debug", `Text before this specific link: "${beforeLinkText}"`);

        // Extract format using the consistent pattern: "FORMAT: [link]"
        // Look for text after the last line break (or start) up to the colon
        const formatMatch = beforeLinkText.match(/(?:^|\n)\s*([^:\n\r]+?)\s*:\s*$/i);
        if (formatMatch) {
          format = formatMatch[1].trim();
          logger.log("debug", `Extracted format "${format}" from consistent pattern`);
        } else {
          // Fallback: look for format at the very end
          const endMatch = beforeLinkText.match(/([^:\n\r]+?)\s*:\s*$/);
          if (endMatch) {
            format = endMatch[1].trim();
            logger.log("debug", `Extracted format "${format}" from end pattern`);
          }
        }
      }

      // If we still don't have a format, try URL-based detection
      if (format === 'Unknown' || !format) {
        if (href.includes('/hevc/') || href.toLowerCase().includes('hevc')) {
          format = 'HEVC';
        } else if (href.includes('.mp3')) {
          format = 'MP3';
        } else if (href.includes('.mp4')) {
          format = 'h.264';
        }
        logger.log("debug", `URL-based format detection: "${format}" for URL "${href}"`);
      }

      logger.log("debug", `Found download link: format="${format}", url="${href}"`);
      downloadLinks.push({
        url: href,
        format
      });
    } else {
      logger.log("debug", `Skipping non-download link: "${href}" (text: "${linkText}")`);
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
      // Get all paragraph text, but filter out download-related content
      let description = '';
      paragraphs.each((index, element) => {
        const $para = $(element);
        let text = $para.text().trim();

        // Skip paragraphs that contain download links
        if ($para.find('a[href]').length > 0) {
          return; // skip this paragraph entirely
        }

        // Clean up common download-related text patterns
        text = text.replace(/h\.?264\s*\d+p?\s*:?\s*$/gi, '');
        text = text.replace(/MP3\s*:?\s*$/gi, '');
        text = text.replace(/Right\s*Click\s*and\s*"?Save\s*As"?/gi, '');
        text = text.replace(/Download\s*-?\s*/gi, '');
        text = text.trim();

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
 * Parse published date from various text formats
 */
function parsePublishedDate(dateText: string): Date {
  if (!dateText) return new Date();

  // Clean up the date text
  dateText = dateText.trim();
  logger.log("debug", `Parsing date text: "${dateText}"`);

  // Handle relative dates first (most common pattern for "X days ago")
  const relativeMatch = dateText.match(/(\d+)\s*(hour|day|week|month)s?\s+ago/i);
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1]);
    const unit = relativeMatch[2].toLowerCase();
    const date = new Date();

    logger.log("debug", `Found relative date: ${amount} ${unit}s ago`);

    switch (unit) {
      case 'hour':
        date.setHours(date.getHours() - amount);
        break;
      case 'day':
        date.setDate(date.getDate() - amount);
        break;
      case 'week':
        date.setDate(date.getDate() - (amount * 7));
        break;
      case 'month':
        date.setMonth(date.getMonth() - amount);
        break;
    }

    logger.log("debug", `Parsed relative date to: ${date.toISOString()}`);
    return date;
  }

  // Handle today/yesterday
  if (dateText.toLowerCase().includes('today')) {
    return new Date();
  } else if (dateText.toLowerCase().includes('yesterday')) {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday;
  }

  // Try different absolute date formats
  const patterns = [
    // ISO formats first (most reliable)
    /(\d{4}-\d{2}-\d{2})/,             // "2024-09-12"
    // Full date formats
    /(\w+ \d{1,2}, \d{4})/i,           // "September 12, 2024"
    /(\d{1,2} \w+ \d{4})/i,            // "12 September 2024"
    /(\w+ \d{1,2})/i,                  // "September 12" (current year)
    /(\d{1,2} \w+)/i,                  // "12 September" (current year)
  ];

  for (const pattern of patterns) {
    const match = dateText.match(pattern);
    if (match) {
      const matchedText = match[1];
      logger.log("debug", `Found date pattern match: "${matchedText}"`);

      // Try to parse as a regular date
      let parseText = matchedText;

      // If no year, add current year (check for any 4-digit year, not just specific ones)
      if (!/\d{4}/.test(parseText)) {
        parseText = `${parseText} ${new Date().getFullYear()}`;
        logger.log("debug", `Added current year: "${parseText}"`);
      }

      const parsed = new Date(parseText);
      if (!isNaN(parsed.getTime())) {
        logger.log("debug", `Successfully parsed date: ${parsed.toISOString()}`);
        return parsed;
      } else {
        logger.log("debug", `Failed to parse date: "${parseText}"`);
      }
    }
  }

  // Fallback to current date
  logger.log("debug", "No valid date found, using current date");
  return new Date();
}

/**
 * Create DfContentInfo from parsed post data
 */
function createContentInfoFromPost(post: ParsedPatreonPost): DfContentInfo {
  // Generate consistent content name
  const sanitizedTitle = post.title.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const contentName = `${sanitizedTitle}-manual-download`;

  // Create MediaInfo objects using the utility function
  const mediaInfo: MediaInfo[] = post.downloadLinks.map((link) =>
    createMediaInfoFromFormatString(link.format, link.url)
  );

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

