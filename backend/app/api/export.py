"""Export endpoint."""
import logging
from fastapi import APIRouter, HTTPException
from typing import List

from app.schemas import ExportRequest, ExportResponse
from app.api.ingest import documents_store

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/export", response_model=ExportResponse)
async def export_documents(request: ExportRequest):
    """Export document summaries."""
    try:
        exported_docs = []
        for doc_id in request.doc_ids:
            if doc_id not in documents_store:
                continue
            doc_data = documents_store[doc_id]
            exported_docs.append(doc_data)
        
        if not exported_docs:
            raise HTTPException(status_code=404, detail="No documents found")
        
        if request.format == "markdown":
            content = _export_markdown(exported_docs)
        else:
            content = _export_json(exported_docs)
        
        return ExportResponse(
            content=content,
            format=request.format,
            doc_ids=request.doc_ids
        )
        
    except Exception as e:
        logger.error(f"Error exporting documents: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error exporting: {str(e)}")


def _export_markdown(docs: List[dict]) -> str:
    """Export documents as Markdown."""
    lines = ["# Document Export\n"]
    
    for doc in docs:
        lines.append(f"## {doc['filename']}\n")
        lines.append(f"**Document ID:** {doc['doc_id']}\n")
        lines.append(f"**Pages:** {doc['pages']}\n")
        lines.append(f"**Chunks:** {doc['chunks']}\n\n")
        
        if doc.get('summary'):
            summary = doc['summary']
            lines.append("### Summary\n")
            lines.append(f"{summary.summary}\n\n")
            
            if summary.technologies:
                lines.append("### Technologies\n")
                lines.append(", ".join(summary.technologies) + "\n\n")
            
            if summary.focus_areas:
                lines.append("### Focus Areas\n")
                for area in summary.focus_areas:
                    lines.append(f"- {area}\n")
                lines.append("\n")
            
            if summary.use_cases:
                lines.append("### Use Cases\n")
                for use_case in summary.use_cases:
                    lines.append(f"- {use_case}\n")
                lines.append("\n")
        
        lines.append("---\n\n")
    
    return "".join(lines)


def _export_json(docs: List[dict]) -> str:
    """Export documents as JSON."""
    import json
    
    export_data = {
        "documents": [
            {
                "doc_id": doc['doc_id'],
                "filename": doc['filename'],
                "pages": doc['pages'],
                "chunks": doc['chunks'],
                "summary": doc.get('summary').dict() if doc.get('summary') else None,
                "metadata": doc.get('metadata').dict() if doc.get('metadata') else None
            }
            for doc in docs
        ]
    }
    
    return json.dumps(export_data, indent=2)

