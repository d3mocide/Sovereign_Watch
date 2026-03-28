import json
import logging
import os
import xml.etree.ElementTree as ET
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
    ]
)


def _source_name(url: str) -> str:
    """Derive a short source label from a feed URL."""
    host = urlparse(url).netloc.lower()
    host = host.removeprefix("www.").removeprefix("feeds.").removeprefix("rss.")
    return host.split(".")[0].upper()


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
                link = (
                    link_el.text.strip() if link_el is not None and link_el.text else ""
                )
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
                link = link_el.get("href", "") if link_el is not None else ""
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
                        }
                    )
    except ET.ParseError as e:
        logger.warning(f"Failed to parse RSS XML from {source}: {e}")
    return items


async def _fetch_feeds() -> list[dict]:
    """Fetch all configured RSS feeds and return merged, sorted items."""
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
                    all_items.extend(items)
                    logger.debug(f"Fetched {len(items)} items from {source}")
                else:
                    logger.warning(
                        f"Non-200 response from {source}: {resp.status_code}"
                    )
            except Exception as e:
                logger.warning(f"Failed to fetch feed from {source}: {e}")

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
