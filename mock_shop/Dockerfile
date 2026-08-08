FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir fastapi "uvicorn[standard]"
COPY . .
ENV PORT=8001
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8001}"]
