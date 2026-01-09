FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    tesseract-ocr-eng \
    libmagic1 \
    build-essential \
    wget \
    unzip \
    git \
    # WeasyPrint dependencies
    libpango-1.0-0 \
    libpangoft2-1.0-0 \
    libcairo2 \
    libgdk-pixbuf2.0 \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

# Copy requirements first for better caching
COPY requirements.txt .

# Install Python dependencies
# Note: NeMo Guardrails and langchain may have additional dependencies
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY . .

# Create data directories and ensure guardrails config exists
RUN mkdir -p /app/data/chroma /app/data/raw /app/data/logs /app/data/library /app/data/projects /app/data/mindmaps && \
    mkdir -p /app/app/guardrails && \
    chmod -R 755 /app

# Verify guardrails configuration exists
RUN if [ -f /app/app/guardrails/config.yml ]; then \
        echo "Guardrails configuration found"; \
    else \
        echo "Warning: Guardrails configuration not found"; \
    fi

# Expose port
EXPOSE 8000

# Run application
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
