"""Entry point for both services. LAB70_ROLE, set by the deploy command, selects the app."""
import os

if os.environ["LAB70_ROLE"] == "frontend":
    from frontend import app
else:
    from backend import app

__all__ = ["app"]  # gunicorn serves main:app (see Procfile)
