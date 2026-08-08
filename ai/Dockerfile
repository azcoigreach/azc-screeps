FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

COPY ai/requirements.txt /app/ai/requirements.txt
RUN pip install --no-cache-dir -r /app/ai/requirements.txt

COPY ai /app/ai
COPY tools /app/tools

WORKDIR /app/ai

CMD ["python", "-m", "commander.main", "watch"]
