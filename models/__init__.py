# models/__init__.py
from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()

from .region import Region  # noqa
from .city import City      # noqa
from .train_line import TrainLine  # noqa
from .agent import Agent  # noqa
from .tool import Tool  # noqa
from .agent_task_progress import AgentTaskProgress  # noqa
from .lab_action import LabAction, LabActionState  # noqa
