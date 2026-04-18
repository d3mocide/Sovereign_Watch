"""
Semantic cache for LLM evaluation results.

Uses RedisVL SemanticCache to short-circuit repeated or near-identical
evaluate_escalation() calls.  A cosine-similarity threshold of 0.94 ensures
only genuinely equivalent prompts are served from cache — close paraphrases
of the same region + context hit the cache while distinct regions do not.

Redis key prefix: ``llm_sem_cache``
TTL: 120 seconds (aligned with h3_risk 30-s Redis cache cadence × 4 poll cycles)

Usage::

    from services.semantic_cache import get_semantic_cache

    cache = await get_semantic_cache()
    hit = await cache.check(prompt)
    if hit:
        return hit
    result = await llm_call(prompt)
    await cache.store(prompt, result)
"""

import logging
from typing import Optional

logger = logging.getLogger("SovereignWatch.SemanticCache")

# Similarity threshold: 0.94 → only nearly-identical prompts hit cache.
SIMILARITY_THRESHOLD = 0.94
# TTL in seconds for cached responses.
CACHE_TTL_SECONDS = 120
# Redis key prefix for the semantic index.
CACHE_KEY_PREFIX = "llm_sem_cache"
# Embedding model used by RedisVL (sentence-transformers via local cache).
_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2"

_cache_instance: Optional["SovereignSemanticCache"] = None


class SovereignSemanticCache:
    """
    Thin wrapper around redisvl.extensions.llmcache.SemanticCache.

    Lazy-initialised once per process.  If redisvl or the embedding model is
    unavailable the wrapper degrades gracefully — all operations become no-ops
    so the rest of the pipeline is unaffected.
    """

    def __init__(self):
        self._cache = None
        self._available = False

    async def initialise(self, redis_url: str) -> None:
        """Attempt to connect and create the SemanticCache index."""
        try:
            from redisvl.extensions.llmcache import SemanticCache

            self._cache = SemanticCache(
                name=CACHE_KEY_PREFIX,
                redis_url=redis_url,
                distance_threshold=1.0 - SIMILARITY_THRESHOLD,  # RedisVL uses distance, not similarity
                ttl=CACHE_TTL_SECONDS,
            )
            self._available = True
            logger.info(
                "SemanticCache initialised (threshold=%.2f, ttl=%ds)",
                SIMILARITY_THRESHOLD,
                CACHE_TTL_SECONDS,
            )
        except ImportError:
            logger.warning(
                "redisvl not importable in the current backend runtime — SemanticCache disabled.  "
                "The dependency is declared in pyproject.toml, so rebuild or reinstall the backend API environment."
            )
        except Exception as exc:
            logger.warning("SemanticCache init failed (degraded gracefully): %s", exc)

    async def check(self, prompt: str) -> Optional[str]:
        """
        Return a cached LLM response string if a semantically similar prompt
        was stored within TTL, otherwise return None.
        """
        if not self._available or self._cache is None:
            return None
        try:
            results = self._cache.check(prompt=prompt, num_results=1)
            if results:
                logger.debug("SemanticCache HIT (distance=%.4f)", results[0].get("vector_distance", 0))
                return results[0].get("response")
        except Exception as exc:
            logger.debug("SemanticCache check error (ignored): %s", exc)
        return None

    async def store(self, prompt: str, response: str) -> None:
        """Store an LLM response against its prompt vector."""
        if not self._available or self._cache is None:
            return
        try:
            self._cache.store(prompt=prompt, response=response)
        except Exception as exc:
            logger.debug("SemanticCache store error (ignored): %s", exc)


async def get_semantic_cache(redis_url: str = "redis://sovereign-redis:6379") -> SovereignSemanticCache:
    """
    Return the process-level SemanticCache singleton, initialising it on first
    call.  Thread-safe for asyncio (single-threaded event loop).
    """
    global _cache_instance
    if _cache_instance is None:
        _cache_instance = SovereignSemanticCache()
        await _cache_instance.initialise(redis_url)
    return _cache_instance
