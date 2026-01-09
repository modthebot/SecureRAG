"""Latest Tools discovery agent using GitHub API."""
import logging
import aiohttp
import json
from typing import List, Dict, Optional
from datetime import datetime, timedelta
from pathlib import Path

from app.config import settings
from app.services.model_adapter import OllamaAdapter

logger = logging.getLogger(__name__)


class ToolsAgent:
    """Agent for discovering latest penetration testing tools from GitHub."""
    
    def __init__(self):
        # Use agent model if configured, otherwise use default
        agent_model_name = getattr(settings, 'ollama_agent_model', None) or settings.ollama_model
        self.agent_model = OllamaAdapter(model=agent_model_name)
        
        self.cache_file = Path(settings.data_dir) / "tools_cache.json"
        self.cache_ttl = timedelta(hours=24)
        self.github_api_url = "https://api.github.com"
    
    def _load_cache(self) -> Optional[Dict]:
        """Load cached tools (supports legacy flat list and per-category cache)."""
        if not self.cache_file.exists():
            return None
        
        try:
            with open(self.cache_file, 'r') as f:
                cache_data = json.load(f)
            cache_time = datetime.fromisoformat(cache_data.get('timestamp', ''))
            if datetime.now() - cache_time < self.cache_ttl:
                return cache_data
        except Exception as e:
            logger.warning(f"Error loading tools cache: {e}")
        return None
    
    def _save_cache(self, tools: List[Dict], category: Optional[str] = None):
        """Save tools to cache, per category, while keeping legacy flat list for compatibility."""
        try:
            existing = {}
            if self.cache_file.exists():
                try:
                    with open(self.cache_file, 'r') as f:
                        existing = json.load(f)
                except Exception:
                    existing = {}

            by_category = existing.get('by_category', {})
            key = category or 'all'
            by_category[key] = tools

            cache_data = {
                'timestamp': datetime.now().isoformat(),
                'tools': tools,          # legacy flat list (all)
                'by_category': by_category
            }
            with open(self.cache_file, 'w') as f:
                json.dump(cache_data, f, indent=2)
        except Exception as e:
            logger.error(f"Error saving tools cache: {e}")
    
    async def _search_github(self, session: aiohttp.ClientSession, query: str, limit: int = 10) -> List[Dict]:
        """Search GitHub repositories."""
        tools = []
        try:
            url = f"{self.github_api_url}/search/repositories"
            params = {
                'q': query,
                'sort': 'updated',
                'order': 'desc',
                'per_page': limit
            }
            
            async with session.get(url, params=params, timeout=aiohttp.ClientTimeout(total=30)) as response:
                if response.status == 200:
                    data = await response.json()
                    for repo in data.get('items', [])[:limit]:
                        tools.append({
                            'name': repo.get('name', ''),
                            'full_name': repo.get('full_name', ''),
                            'description': repo.get('description') or '',
                            'url': repo.get('html_url', ''),
                            'stars': repo.get('stargazers_count', 0),
                            'language': repo.get('language') or None,
                            'updated_at': repo.get('updated_at', ''),
                            'topics': repo.get('topics', [])
                        })
                elif response.status == 403:
                    reset = response.headers.get("X-RateLimit-Reset")
                    reset_msg = f" Rate limit resets at {reset}." if reset else ""
                    logger.warning(f"GitHub API rate limit reached.{reset_msg} Using cached data if available.")
        except Exception as e:
            logger.error(f"Error searching GitHub: {e}")
        
        return tools
    
    async def _filter_tools(self, tools: List[Dict]) -> List[Dict]:
        """Filter and rank tools using LLM agent."""
        if not tools:
            return []
        
        filter_prompt = f"""Analyze the following GitHub repositories and identify which are relevant penetration testing tools.
Return a JSON array with the most relevant tools, each with: name, full_name, description, url, stars, language, updated_at, topics, relevance_score.

Repositories to analyze:
{json.dumps(tools[:30], indent=2)}  # Limit to 30 for prompt size

Focus on tools for:
- Web application security testing
- API security testing
- Mobile app security (APK/IPA)
- Network penetration testing
- Vulnerability scanning
- Exploit development
"""
        
        try:
            response = self.agent_model.generate_text(
                prompt=filter_prompt,
                max_tokens=3000,
                temperature=0.3
            )
            
            # Try to extract JSON from response
            import re
            json_match = re.search(r'\[.*\]', response, re.DOTALL)
            if json_match:
                filtered = json.loads(json_match.group())
                # Sort by relevance_score if available, else by stars
                filtered.sort(key=lambda x: x.get('relevance_score', x.get('stars', 0)), reverse=True)
                return filtered[:20]  # Return top 20
        except Exception as e:
            logger.warning(f"Error filtering tools with LLM, using unfiltered star-ranked list: {e}")
        
        # Fallback: return tools sorted by stars
        return sorted(tools, key=lambda x: x.get('stars', 0), reverse=True)[:20]
    
    async def get_latest_tools(self, category: Optional[str] = None) -> List[Dict]:
        """Get latest penetration testing tools from GitHub, optionally filtered by category."""
        # Check cache first (per category if available)
        cache_key = category or 'all'
        cached_data = self._load_cache()
        cached_tools = None
        if cached_data:
            cached_by_cat = cached_data.get('by_category', {})
            if cache_key in cached_by_cat:
                cached_tools = cached_by_cat[cache_key]
            elif not category:
                cached_tools = cached_data.get('tools', [])
        if cached_tools:
            return cached_tools
        
        # Category-specific search queries
        category_queries = {
            "AWS": [
                "aws security",
                "cloud security aws",
                "aws penetration testing",
                "aws security scanner"
            ],
            "GCP": [
                "gcp security",
                "google cloud security",
                "gcp penetration testing",
                "gcp security scanner"
            ],
            "AI": [
                "ai security",
                "machine learning security",
                "ai penetration testing",
                "ml security tools"
            ],
            "LLM": [
                "llm security",
                "large language model security",
                "gpt security",
                "llm penetration testing"
            ],
            "WEB": [
                "web security scanner",
                "web application security",
                "web penetration testing",
                "owasp tools"
            ],
            "APK": [
                "android security",
                "apk security",
                "android penetration testing",
                "mobile security android"
            ],
            "IPA": [
                "ios security",
                "ipa security",
                "ios penetration testing",
                "iphone security tools"
            ],
            "API": [
                "api security",
                "rest api security",
                "graphql security",
                "api penetration testing"
            ],
            "THICK": [
                "thick client security",
                "desktop application security",
                "client application security",
                "desktop penetration testing"
            ],
            "OTC": [
                "offensive security",
                "penetration testing framework",
                "red team tools",
                "exploitation framework"
            ]
        }
        
        # Default queries if no category or category not found
        if category and category in category_queries:
            search_queries = category_queries[category]
        else:
            # All categories except FutureTools
            search_queries = [
                "penetration testing",
                "security scanner",
                "vulnerability scanner",
                "exploit framework",
                "web security",
                "api security",
                "offensive security"
            ]
        
        all_tools = []
        rate_limited = False
        async with aiohttp.ClientSession() as session:
            for query in search_queries:
                tools = await self._search_github(session, query, limit=10)
                if not tools:
                    rate_limited = True if rate_limited is False else rate_limited
                all_tools.extend(tools)
        
        # Remove duplicates by full_name
        seen = set()
        unique_tools = []
        for tool in all_tools:
            if tool['full_name'] not in seen:
                seen.add(tool['full_name'])
                unique_tools.append(tool)
        
        if not unique_tools and rate_limited and cached_tools:
            logger.warning("GitHub rate limit hit; serving cached tools.")
            return cached_tools

        # Filter and rank using LLM
        filtered_tools = await self._filter_tools(unique_tools)
        
        # Save to cache (per category)
        self._save_cache(filtered_tools, category)
        
        return filtered_tools


# Global instance
_tools_agent = None

def get_tools_agent() -> ToolsAgent:
    """Get or create tools agent instance."""
    global _tools_agent
    if _tools_agent is None:
        _tools_agent = ToolsAgent()
    return _tools_agent

