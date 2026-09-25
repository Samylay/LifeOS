# Text and video extraction research

Date: 2026-09-22

Question: how do other AI and scraping users handle the gap between web-page crawling and actual video understanding?

## Finding

The common solution is a routed pipeline, not one universal crawler:

```text
URL
 ├─ HTML/article/docs → Crawl4AI → Markdown + links + provenance
 ├─ YouTube/video page → yt-dlp → metadata + captions when available
 ├─ video with no captions → yt-dlp/FFmpeg → audio → Whisper → transcript
 └─ PDF/DOCX/binary → content-type router → document-specific extractor
```

Crawl4AI remains the browser and text layer. It should not be asked to transcribe a video or parse every binary document.

## What the sources show

### 1. Text pages

Crawl4AI's own documentation recommends using its Markdown output, content filters, CSS/XPath extraction, JavaScript waits, and session reuse for dynamic sites. Its deep-crawl tools add URL filtering and relevance scoring, but the result still needs a quality gate. [Quick Start](https://docs.crawl4ai.com/core/quickstart/), [configuration reference](https://docs.crawl4ai.com/api/parameters/), [deep crawling](https://docs.crawl4ai.com/core/deep-crawling/)

The Crawl4AI issue tracker shows why a browser crawl can still fail on a page that works in a normal browser. One report describes transcript content loaded through XHR not arriving in the managed browser. The practical remedies discussed are page interaction, explicit waits, and a direct request path when the site's data endpoint is known. [Crawl4AI XHR/transcript issue #684](https://github.com/unclecode/crawl4ai/issues/684)

Implication for LifeOS: a result with lots of HTML is not automatically usable evidence. We need to detect login chrome, repeated navigation, missing article structure, and very low visible-content density.

### 2. YouTube captions

yt-dlp is the community-standard extraction layer for video sites. Its official README supports metadata-only inspection, skipping the video download, manual subtitles, automatically generated subtitles, language selection, subtitle conversion, audio extraction, and format selection. [yt-dlp README](https://github.com/yt-dlp/yt-dlp/blob/master/README.md)

The yt-dlp maintainers' answer to “how do I download a transcript?” is:

```bash
yt-dlp --skip-download --write-subs --write-auto-subs \
  --sub-langs 'en.*' --convert-subs srt URL
```

The exact flags and language filter should be selected per source. Manual captions should be preferred over auto captions, with the caption type recorded as provenance. The tracker also documents that translated auto-captions can hit rate limits even when original-language captions work, so failures must be explicit rather than silently treated as “no transcript.” [yt-dlp subtitle answer](https://github.com/yt-dlp/yt-dlp/issues/13353), [yt-dlp subtitle rate-limit issue](https://github.com/yt-dlp/yt-dlp/issues/13831)

Implication for LifeOS: for YouTube, try captions before downloading media. The current Crawl4AI result is useful for title and page metadata but not for the spoken content.

### 3. Video with no usable captions

The fallback used by local AI workflows is audio extraction followed by speech recognition. yt-dlp supports audio-only extraction through FFmpeg. OpenAI Whisper accepts an audio file, processes it in sliding windows, and returns text, language, and optionally timestamped segments. [yt-dlp audio extraction](https://github.com/yt-dlp/yt-dlp/blob/master/README.md), [Whisper README](https://github.com/openai/whisper/blob/main/README.md), [Whisper transcription implementation](https://github.com/openai/whisper/blob/main/whisper/transcribe.py)

Whisper's own documentation distinguishes transcription from translation. The `turbo` model is intended for fast transcription and is not the model to use for translating non-English speech into English. That matters for LifeOS because a transcript needs language and task metadata attached to it.

Implication for LifeOS: reuse the existing Whisper service for the fallback. Do not send video bytes through Crawl4AI or the Next.js request path. A worker should download to a bounded temporary directory, extract audio, transcribe, then delete the media.

### 4. X/Twitter videos

yt-dlp has a dedicated Twitter extractor. Its current extractor supports multiple extraction APIs, including `graphql`, `legacy`, and `syndication`, and the extractor source handles video variants and subtitles when the platform exposes them. [yt-dlp extractor options](https://github.com/yt-dlp/yt-dlp/blob/master/README.md), [Twitter extractor source](https://github.com/yt-dlp/yt-dlp/blob/master/yt_dlp/extractor/twitter.py)

The practical pattern is:

1. Use Crawl4AI only to read the visible post context, author, timestamp, and links.
2. Use yt-dlp for the actual media URL and available subtitles.
3. If no captions exist, extract audio and send it through Whisper.

Do not treat the X HTML page as the transcript. Our own PoC demonstrated why: X returned login controls, duplicated post content, and noisy navigation around the useful text.

### 5. Instagram videos

Instagram is materially less reliable. yt-dlp has an Instagram extractor, but its own issue tracker contains recent reports of 404s, empty media responses, and reels that remain playable in a logged-in browser while extraction fails, even with fresh cookies. [recent Instagram extractor issue](https://github.com/yt-dlp/yt-dlp/issues/17275), [authenticated reel failure](https://github.com/yt-dlp/yt-dlp/issues/13551)

That means Instagram needs an explicit best-effort policy:

- Public reel/post URL: try yt-dlp metadata and media extraction.
- Authenticated or private content: require a user-provided browser export or local capture. Do not put LifeOS credentials into the crawler.
- If media extraction fails: preserve the URL and visible caption as partial evidence, then offer a local upload or audio extraction path.
- Never mark an Instagram page as a complete transcript merely because Crawl4AI found a title and an HTML video element.

For both X and Instagram, cookies are sensitive user data. They belong in a local worker or browser-controlled flow, never in a persisted LifeOS document or a remote Crawl4AI request.

### 6. Binary documents and media URLs

Crawl4AI maintainers and users identify a separate failure mode for PDFs, DOCX, XLSX, and other binary URLs: the browser may return viewer chrome, empty Markdown, or garbage. Their discussion recommends routing binary content to a document-specific backend rather than forcing it through the HTML pipeline. [Crawl4AI document-aware processing discussion #1890](https://github.com/unclecode/crawl4ai/discussions/1890)

Implication for LifeOS: branch on response content type and URL extension before crawling. A direct `.mp4` should go to media handling. A PDF should go to PDF extraction. The crawler's PDF capture feature is useful for rendering a page to PDF, but that is different from parsing an arbitrary PDF source.

## Recommended LifeOS design

Add a `sourceKind` decision before acquisition:

| Source | First attempt | Fallback | Stored result |
|---|---|---|---|
| Article or docs page | Crawl4AI Markdown | Jina or plain fetch | Markdown, canonical URL, title, quality, links |
| JS-rendered page | Crawl4AI with bounded wait/interaction | plain fetch | Same, plus wait strategy and partial status |
| YouTube page | yt-dlp metadata and manual captions | auto captions, then audio + Whisper | Transcript, timestamps, caption source, language |
| X/Twitter video | Crawl4AI for post context, yt-dlp for media | audio + Whisper | Post context, media provenance, transcript |
| Instagram video | yt-dlp for public media | user-provided capture or audio + Whisper | Caption, media provenance, transcript or unavailable reason |
| Other video | yt-dlp extractor if supported | FFmpeg + Whisper | Transcript, timestamps, media provenance |
| PDF/document | Content-type router | PDF/document parser | Extracted text, page references, quality |
| X/Instagram/login wall | Refuse as source text | User-provided export or caption | `unavailable`, with reason |

Every path should return the same outer envelope:

```json
{
  "status": "complete | partial | unavailable",
  "sourceKind": "web | caption | transcript | document",
  "canonicalUrl": "https://…",
  "content": "…",
  "language": "en",
  "provenance": {"method": "crawl4ai | yt-dlp | whisper", "source": "…"},
  "issues": []
}
```

The existing LifeOS exact-quote rule should remain in force. A model may select passages, but stored passages must slice exactly from the fetched text or transcript.

## Practical conclusion

The best next PoC is not “make Crawl4AI understand video.” It is “add a source router beside Crawl4AI.” First implement caption retrieval for YouTube and X, then fall back to the existing Whisper service. Treat Instagram as best-effort and partial by default. Keep Crawl4AI for the page around the video, metadata, links, and ordinary text pages.
