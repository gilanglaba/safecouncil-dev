"""
WSGI entry point for production deployment (Railway, Render, Heroku).
Usage: gunicorn --bind 0.0.0.0:$PORT wsgi:app
"""
import os
import sys

# Ensure backend directory is on the Python path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app import app  # noqa: F401 — app is the WSGI callable

if __name__ == "__main__":
    app.run()
