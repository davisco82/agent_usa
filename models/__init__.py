# models/__init__.py
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

from .region import Region  # noqa
from .city import City      # noqa
from .train_line import TrainLine  # noqa
