"""Legacy compatibility shim.

The Ikion Core runtime now lives in `runtime.py` and `app.py`.
This module is intentionally thin so old imports do not keep the prototype
research-agent architecture alive in the new backend.
"""

from .app import create_app
from .runtime import IkionCoreRuntime, create_runtime

__all__ = ["IkionCoreRuntime", "create_app", "create_runtime"]
