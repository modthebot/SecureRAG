"""Document parser for PDF, Word, HTML, and images."""
import os
import logging
import uuid
from pathlib import Path
from typing import List, Tuple, Optional
import pdfplumber
import docx
from bs4 import BeautifulSoup
from PIL import Image
import pytesseract
import fitz  # PyMuPDF

from app.config import settings

logger = logging.getLogger(__name__)


class DocumentParser:
    """Parser for various document formats."""
    
    def __init__(self):
        self.supported_extensions = {
            '.pdf',
            '.docx',
            '.doc',
            '.html',
            '.htm',
            '.png',
            '.jpg',
            '.jpeg',
        }
    
    def parse(self, file_path: str, doc_id: str) -> Tuple[str, int, List[str]]:
        """
        Parse a document and return text, page count, and image paths.
        
        Returns:
            Tuple of (full_text, page_count, image_paths)
        """
        path = Path(file_path)
        ext = path.suffix.lower()
        
        if ext == '.pdf':
            return self._parse_pdf(file_path, doc_id)
        elif ext in {'.docx', '.doc'}:
            return self._parse_docx(file_path, doc_id)
        elif ext in {'.png', '.jpg', '.jpeg'}:
            return self._parse_image(file_path, doc_id)
        elif ext in {'.html', '.htm'}:
            return self._parse_html(file_path, doc_id)
        else:
            raise ValueError(f"Unsupported file type: {ext}")
    
    def _parse_pdf(self, file_path: str, doc_id: str) -> Tuple[str, int, List[str]]:
        """Parse PDF file."""
        text_parts = []
        image_paths = []
        
        try:
            # Try pdfplumber first for better text extraction
            with pdfplumber.open(file_path) as pdf:
                page_count = len(pdf.pages)
                
                for page_num, page in enumerate(pdf.pages, 1):
                    # Extract text
                    page_text = page.extract_text()
                    if page_text:
                        text_parts.append(f"\n--- Page {page_num} ---\n{page_text}")
                    
                    # Extract images from page
                    images = page.images
                    if images:
                        # Use PyMuPDF to extract images
                        doc = fitz.open(file_path)
                        page_obj = doc[page_num - 1]
                        image_list = page_obj.get_images()
                        
                        for img_idx, img in enumerate(image_list):
                            try:
                                xref = img[0]
                                base_image = doc.extract_image(xref)
                                image_bytes = base_image["image"]
                                
                                # Save image
                                image_dir = Path(settings.raw_docs_dir) / doc_id / "images"
                                image_dir.mkdir(parents=True, exist_ok=True)
                                image_path = image_dir / f"page_{page_num}_img_{img_idx}.png"
                                
                                with open(image_path, "wb") as img_file:
                                    img_file.write(image_bytes)
                                
                                image_paths.append(str(image_path))
                                
                                # OCR the image
                                try:
                                    ocr_text = pytesseract.image_to_string(Image.open(image_path))
                                    if ocr_text.strip():
                                        text_parts.append(f"\n[Image OCR from page {page_num}]:\n{ocr_text}")
                                except Exception as e:
                                    logger.warning(f"OCR failed for image {image_path}: {e}")
                                
                            except Exception as e:
                                logger.warning(f"Failed to extract image from PDF page {page_num}: {e}")
                        
                        doc.close()
                
                full_text = "\n".join(text_parts)
                return full_text, page_count, image_paths
                
        except Exception as e:
            logger.error(f"Error parsing PDF with pdfplumber: {e}")
            # Fallback to PyMuPDF
            try:
                doc = fitz.open(file_path)
                page_count = len(doc)
                text_parts = []
                
                for page_num in range(page_count):
                    page = doc[page_num]
                    page_text = page.get_text()
                    if page_text:
                        text_parts.append(f"\n--- Page {page_num + 1} ---\n{page_text}")
                
                full_text = "\n".join(text_parts)
                doc.close()
                return full_text, page_count, image_paths
                
            except Exception as e2:
                logger.error(f"Error parsing PDF with PyMuPDF: {e2}")
                raise
    
    def _parse_docx(self, file_path: str, doc_id: str) -> Tuple[str, int, List[str]]:
        """Parse DOCX file."""
        try:
            doc = docx.Document(file_path)
            text_parts = []
            image_paths = []
            
            # Extract text from paragraphs
            for para in doc.paragraphs:
                if para.text.strip():
                    text_parts.append(para.text)
            
            # Extract images
            image_dir = Path(settings.raw_docs_dir) / doc_id / "images"
            image_dir.mkdir(parents=True, exist_ok=True)
            
            # Extract images from document relationships
            try:
                for rel in doc.part.rels.values():
                    if "image" in rel.target_ref:
                        try:
                            image = rel.target_part.blob
                            image_path = image_dir / f"image_{len(image_paths)}.png"
                            
                            with open(image_path, "wb") as img_file:
                                img_file.write(image)
                            
                            image_paths.append(str(image_path))
                            
                            # OCR the image
                            try:
                                ocr_text = pytesseract.image_to_string(Image.open(image_path))
                                if ocr_text.strip():
                                    text_parts.append(f"\n[Image OCR]:\n{ocr_text}")
                            except Exception as e:
                                logger.warning(f"OCR failed for image {image_path}: {e}")
                                
                        except Exception as e:
                            logger.warning(f"Failed to extract image from DOCX: {e}")
            except Exception as e:
                logger.warning(f"Error extracting images from DOCX: {e}")
            
            full_text = "\n".join(text_parts)
            # Estimate pages (rough: ~500 words per page)
            word_count = len(full_text.split())
            page_count = max(1, word_count // 500)
            
            return full_text, page_count, image_paths
            
        except Exception as e:
            logger.error(f"Error parsing DOCX: {e}")
            raise
    
    def _parse_image(self, file_path: str, doc_id: str) -> Tuple[str, int, List[str]]:
        """Parse image file with OCR."""
        try:
            image = Image.open(file_path)
            text = pytesseract.image_to_string(image)
            
            # Save a copy in the doc directory
            image_dir = Path(settings.raw_docs_dir) / doc_id / "images"
            image_dir.mkdir(parents=True, exist_ok=True)
            saved_path = image_dir / Path(file_path).name
            image.save(saved_path)
            
            return text, 1, [str(saved_path)]
            
        except Exception as e:
            logger.error(f"Error parsing image: {e}")
            raise

    def _parse_html(self, file_path: str, doc_id: str) -> Tuple[str, int, List[str]]:
        """Parse HTML file."""
        try:
            with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
                html_content = f.read()

            soup = BeautifulSoup(html_content, "html.parser")

            for element in soup(["script", "style"]):
                element.decompose()

            text = soup.get_text(separator="\n")
            clean_lines = [line.strip() for line in text.splitlines() if line.strip()]
            clean_text = "\n".join(clean_lines)

            return clean_text, 1, []
        except Exception as e:
            logger.error(f"Error parsing HTML: {e}")
            raise
    
    def clean_text(self, text: str) -> str:
        """Clean extracted text."""
        # Remove excessive whitespace
        lines = text.split('\n')
        cleaned_lines = []
        
        for line in lines:
            # Remove headers/footers (simple heuristic: very short lines with page numbers)
            if len(line.strip()) < 3 and any(char.isdigit() for char in line):
                continue
            
            cleaned_line = ' '.join(line.split())
            if cleaned_line:
                cleaned_lines.append(cleaned_line)
        
        return '\n'.join(cleaned_lines)

