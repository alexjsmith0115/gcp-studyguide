FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1 PORT=8080
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# Only the app goes into the image. The tests stay in the build workspace.
COPY main.py .

# Run as a user other than root.
RUN useradd --uid 10001 --no-create-home app
USER 10001

# Cloud Run sets PORT. One worker with 8 threads, as in the Cloud Run Python tips.
CMD exec gunicorn --bind :$PORT --workers 1 --threads 8 --timeout 0 main:app
