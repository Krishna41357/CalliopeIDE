"""
Monitoring utilities - stub implementation
Sentry and advanced monitoring removed to resolve CI issues
"""
import logging
from typing import Any, Dict, Optional
from flask import Flask


def setup_logging(name: str):
    """Setup basic Python logging"""
    logger = logging.getLogger(name)
    logger.setLevel(logging.INFO)
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
    return logger


def init_sentry(app: Flask):
    """Stub - Sentry integration removed"""
    pass


def monitor_endpoint(func):
    """Stub - endpoint monitoring removed"""
    return func


def get_monitoring_stats() -> Dict[str, Any]:
    """Stub - return basic stats"""
    return {
        'enabled': False,
        'message': 'Monitoring disabled'
    }


def track_error(error: Exception, context: Optional[Dict[str, Any]] = None):
    """Stub - log errors without Sentry"""
    logger = logging.getLogger('calliope-ide')
    logger.error(f"Error: {str(error)}", exc_info=True)
    if context:
        logger.error(f"Context: {context}")


def capture_exception(error: Exception, context: Optional[Dict[str, Any]] = None):
    """Stub - alias for track_error for backward compatibility"""
    track_error(error, context)
