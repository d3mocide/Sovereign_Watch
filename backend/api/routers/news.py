import json
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from urllib.parse import urlparse

import httpx
from core.database import db
from fastapi import APIRouter, HTTPException, Query

router = APIRouter()
logger = logging.getLogger("SovereignWatch.News")

CACHE_KEY = "news:feed"
CACHE_TTL = 900  # 15 minutes

# Default RSS feeds — world/conflict/OSINT relevant, all public
DEFAULT_RSS_URLS = ",".join(
    [
        "https://feeds.bbci.co.uk/news/world/rss.xml",
        "https://www.reddit.com/r/news/top/.rss",
        "https://www.aljazeera.com/xml/rss/all.xml",
        "https://news.un.org/feed/subscribe/en/news/all/rss.xml",
        "https://theaviationist.com/feed/",
        "https://www.defensenews.com/arc/outboundfeeds/rss/?outputType=xml",
    ]
)


def _source_name(url: str) -> str:
    """Derive a short source label from a feed URL."""
    host = urlparse(url).netloc.lower()
    host = host.removeprefix("www.").removeprefix("feeds.").removeprefix("rss.")
    return host.split(".")[0].upper()


def _extract_link(el: ET.Element | None) -> str:
    """Extract a URL from a link element, checking both text content and href attribute."""
    if el is None:
        return ""
    if el.text and el.text.strip():
        return el.text.strip()
    href = el.get("href", "").strip()
    return href


def _parse_pub_date(raw: str) -> datetime:
    """Parse an RSS/Atom date string into a UTC datetime for sorting.

    Falls back to epoch on failure so unparseable dates sort to the bottom.
    """
    if not raw:
        return datetime.fromtimestamp(0, tz=timezone.utc)
    # Try RFC 2822 (RSS 2.0 pubDate)
    try:
        return parsedate_to_datetime(raw)
    except Exception:
        pass
    # Try ISO 8601 (Atom published/updated)
    try:
        return datetime.fromisoformat(raw.rstrip("Z")).replace(tzinfo=timezone.utc)
    except Exception:
        pass
    return datetime.fromtimestamp(0, tz=timezone.utc)


def _parse_rss(xml_text: str, source: str) -> list[dict]:
    """Parse RSS XML and return a list of news items."""
    items = []
    try:
        root = ET.fromstring(xml_text)
        # Handle both RSS 2.0 <channel><item> and Atom feeds
        channel = root.find("channel")
        if channel is not None:
            for item in channel.findall("item"):
                title_el = item.find("title")
                link_el = item.find("link")
                pub_el = item.find("pubDate")
                title = (
                    title_el.text.strip()
                    if title_el is not None and title_el.text
                    else ""
                )
                link = _extract_link(link_el)
                pub_date = (
                    pub_el.text.strip() if pub_el is not None and pub_el.text else ""
                )
                if title:
                    items.append(
                        {
                            "title": title,
                            "link": link,
                            "pub_date": pub_date,
                            "source": source,
                            "_ts": _parse_pub_date(pub_date).timestamp(),
                        }
                    )
        else:
            # Atom feed
            for entry in root.findall("{http://www.w3.org/2005/Atom}entry"):
                title_el = entry.find("{http://www.w3.org/2005/Atom}title")
                link_el = entry.find("{http://www.w3.org/2005/Atom}link")
                pub_el = entry.find("{http://www.w3.org/2005/Atom}published")
                if pub_el is None:
                    pub_el = entry.find("{http://www.w3.org/2005/Atom}updated")
                title = (
                    title_el.text.strip()
                    if title_el is not None and title_el.text
                    else ""
                )
                link = _extract_link(link_el)
                pub_date = (
                    pub_el.text.strip() if pub_el is not None and pub_el.text else ""
                )
                if title:
                    items.append(
                        {
                            "title": title,
                            "link": link,
                            "pub_date": pub_date,
                            "source": source,
                            "_ts": _parse_pub_date(pub_date).timestamp(),
                        }
                    )
    except ET.ParseError as e:
        logger.warning(f"Failed to parse RSS XML from {source}: {e}")
    return items


# Max items retained per source before merging, to prevent one feed dominating.
PER_SOURCE_CAP = 20


async def _fetch_feeds() -> list[dict]:
    """Fetch all configured RSS feeds and return merged, date-sorted items."""
    raw_urls = os.getenv("NEWS_RSS_URLS", DEFAULT_RSS_URLS)
    urls = [u.strip() for u in raw_urls.split(",") if u.strip()]

    all_items: list[dict] = []
    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for url in urls:
            source = _source_name(url)
            try:
                resp = await client.get(
                    url, headers={"User-Agent": "SovereignWatch/1.0"}
                )
                if resp.status_code == 200:
                    items = _parse_rss(resp.text, source)
                    # Sort per-source by recency, then cap so no single feed crowds others
                    items.sort(key=lambda x: x["_ts"], reverse=True)
                    all_items.extend(items[:PER_SOURCE_CAP])
                    logger.info(
                        f"Fetched {len(items)} items from {source} (kept {min(len(items), PER_SOURCE_CAP)})"
                    )
                else:
                    logger.warning(
                        f"Non-200 response from {source}: {resp.status_code}"
                    )
            except Exception as e:
                logger.warning(f"Failed to fetch feed from {source}: {e}")
                if db.redis_client:
                    try:
                        await db.redis_client.set(
                            "poller:news:last_error",
                            json.dumps({"ts": time.time(), "msg": f"{source}: {str(e)}"}),
                            ex=3600
                        )
                    except Exception:
                        pass

    # Sort all collected items newest-first so the feed is interleaved by recency
    if all_items:
        if db.redis_client:
            try:
                await db.redis_client.set("news:last_fetch", str(time.time()), ex=CACHE_TTL * 2)
            except Exception:
                pass
    
    all_items.sort(key=lambda x: x["_ts"], reverse=True)

    # Strip internal timestamp before returning
    for item in all_items:
        item.pop("_ts", None)

    return all_items


@router.get("/api/news/feed")
async def get_news_feed(limit: int = Query(default=40, le=100)):
    """
    Returns aggregated news items from configured RSS feeds.
    Results are cached in Redis for 15 minutes.
    """
    # Try cache first
    if db.redis_client:
        try:
            # Set/Update heartbeat on every access to show aggregator is alive
            await db.redis_client.set("news:last_fetch", str(time.time()), ex=CACHE_TTL * 2)
            
            cached = await db.redis_client.get(CACHE_KEY)
            if cached:
                items = json.loads(cached)
                return items[:limit]
        except Exception as e:
            logger.warning(f"Redis cache read failed: {e}")

    # Fetch fresh data
    try:
        items = await _fetch_feeds()
    except Exception as e:
        logger.error(f"News feed fetch failed: {e}")
        raise HTTPException(status_code=503, detail="Failed to fetch news feeds")

    # Store in cache
    if db.redis_client and items:
        try:
            await db.redis_client.setex(CACHE_KEY, CACHE_TTL, json.dumps(items))
        except Exception as e:
            logger.warning(f"Redis cache write failed: {e}")

    return items[:limit]


ARTICLE_TIMEOUT = 12.0
MAX_ARTICLE_CHARS = 18000


def _normalize_space(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def _strip_html_to_text(html: str) -> str:
    # Prefer an <article> block when present; otherwise use full HTML.
    article_match = re.search(
        r"<article[^>]*>(.*?)</article>", html, flags=re.IGNORECASE | re.DOTALL
    )
    candidate = article_match.group(1) if article_match else html

    # Remove scripts/styles and common chrome sections before text extraction.
    candidate = re.sub(
        r"<script[^>]*>.*?</script>", " ", candidate, flags=re.IGNORECASE | re.DOTALL
    )
    candidate = re.sub(
        r"<style[^>]*>.*?</style>", " ", candidate, flags=re.IGNORECASE | re.DOTALL
    )
    candidate = re.sub(
        r"<(nav|header|footer|aside)[^>]*>.*?</\1>",
        " ",
        candidate,
        flags=re.IGNORECASE | re.DOTALL,
    )
    candidate = re.sub(r"<!--.*?-->", " ", candidate, flags=re.DOTALL)

    # Convert paragraphs and line breaks to newline boundaries first.
    candidate = re.sub(r"</p\s*>", "\n\n", candidate, flags=re.IGNORECASE)
    candidate = re.sub(r"<br\s*/?>", "\n", candidate, flags=re.IGNORECASE)

    # Strip all remaining tags.
    text = re.sub(r"<[^>]+>", " ", candidate)
    text = unescape(text)

    # Normalize line-by-line but keep paragraph boundaries for readability.
    lines = [_normalize_space(line) for line in text.splitlines()]
    lines = [line for line in lines if line]
    collapsed = "\n\n".join(lines)

    if len(collapsed) > MAX_ARTICLE_CHARS:
        return collapsed[:MAX_ARTICLE_CHARS].rstrip() + "..."
    return collapsed


def _extract_title(html: str) -> str:
    m = re.search(r"<title[^>]*>(.*?)</title>", html, flags=re.IGNORECASE | re.DOTALL)
    if not m:
        return ""
    return _normalize_space(unescape(re.sub(r"<[^>]+>", " ", m.group(1))))


@router.get("/api/news/article")
async def get_article_content(url: str = Query(..., min_length=8, max_length=2048)):
    """
    Fetch and extract readable text from a news URL for in-app viewing.
    This avoids browser iframe restrictions from publishers that set X-Frame-Options.
    """
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise HTTPException(status_code=400, detail="Invalid article URL")

    host = parsed.hostname or ""
    if host in {"localhost", "127.0.0.1", "::1"}:
        raise HTTPException(status_code=400, detail="Local URLs are not allowed")

    try:
        async with httpx.AsyncClient(
            timeout=ARTICLE_TIMEOUT, follow_redirects=True
        ) as client:
            resp = await client.get(
                url,
                headers={
                    "User-Agent": "SovereignWatch/1.0",
                    "Accept": "text/html,application/xhtml+xml",
                },
            )
    except Exception as e:
        logger.warning(f"Article fetch failed for {url}: {e}")
        raise HTTPException(status_code=502, detail="Failed to fetch article content")

    if resp.status_code >= 400:
        raise HTTPException(
            status_code=resp.status_code, detail="Article source returned an error"
        )

    html = resp.text or ""
    if not html:
        raise HTTPException(status_code=204, detail="Article returned no content")

    content = _strip_html_to_text(html)
    title = _extract_title(html)

    if not content:
        raise HTTPException(
            status_code=422, detail="Could not extract readable content"
        )

    return {
        "url": str(resp.url),
        "title": title,
        "content": content,
    }
