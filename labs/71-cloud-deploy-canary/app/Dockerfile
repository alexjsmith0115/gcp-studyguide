FROM python:3.12-slim
ARG VERSION=dev
ENV APP_VERSION=${VERSION} PYTHONUNBUFFERED=1
WORKDIR /app
COPY main.py .
CMD ["python", "main.py"]
