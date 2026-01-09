"""Latest Tools API endpoint."""
import logging
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.services.tools_agent import get_tools_agent

logger = logging.getLogger(__name__)
router = APIRouter()


class ToolItem(BaseModel):
    """Single tool item."""
    name: str
    full_name: str
    description: Optional[str] = ""
    url: str
    stars: int
    language: Optional[str] = None
    updated_at: str
    topics: List[str] = Field(default_factory=list)
    relevance_score: float = 0.0


class ToolsResponse(BaseModel):
    """Response containing tools."""
    tools: List[ToolItem]
    count: int


@router.get("/latest", response_model=ToolsResponse)
async def get_latest_tools(category: str = None):
    """Get latest penetration testing tools from GitHub, optionally filtered by category."""
    agent = get_tools_agent()
    
    tools_data = await agent.get_latest_tools(category=category)
    
    # Convert to response format
    tools = [ToolItem(**tool) for tool in tools_data]
    
    return ToolsResponse(
        tools=tools,
        count=len(tools)
    )

