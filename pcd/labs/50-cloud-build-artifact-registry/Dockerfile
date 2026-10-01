# Multi-stage build. Only the last stage becomes the image that you push.

# Stage 1 (build): install the Python packages into a virtual environment.
# The pip cache and any build tools stay in this stage.
FROM python:3.12-slim AS build
RUN python -m venv /venv
COPY requirements.txt .
RUN /venv/bin/pip install -r requirements.txt

# Stage 2 (runtime): a slim base image, the virtual environment, and the code.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PORT=8080 PATH="/venv/bin:$PATH"
COPY --from=build /venv /venv
WORKDIR /app
COPY main.py .

# Run as a user other than root (Cloud Run general development tips).
RUN useradd --uid 10001 --no-create-home app
USER 10001

# Cloud Run sets PORT. One worker with 8 threads, as in the Cloud Run Python tips.
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
