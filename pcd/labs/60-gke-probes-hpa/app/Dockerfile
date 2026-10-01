# Lab 60: the image for lab60-app, the test client, and the load generator.
# The code uses only the Python standard library, so there is no pip install.
FROM python:3.13-slim
WORKDIR /app
COPY main.py load.py ./
# The exec form starts Python as process 1, which gets the TERM signal at shutdown.
CMD ["python", "main.py"]
