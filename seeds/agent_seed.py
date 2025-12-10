"""Seed helper for creating a default agent so quest pipeline can start."""

from flask.cli import with_appcontext
import click

from models import db
from models.agent import Agent
from models.city import City


def register_agent_seed_commands(app):
  @app.cli.command("seed-agent")
  @with_appcontext
  def seed_agent():
    """Create a baseline agent if none exists."""
    existing = Agent.query.first()
    if existing:
      click.echo(f"Agent already exists (id={existing.id}), seed skipped.")
      return

    city = City.query.first()
    if not city:
      click.echo("No cities found. Run seed-cities first.")
      return

    agent = Agent(
      level=1,
      xp=0,
      energy_current=5,
      energy_max=5,
      data_current=0,
      data_max=100,
      material_current=0,
      material_max=100,
      credits=0,
      current_city_id=city.id,
      total_trips=0,
      total_cleaned_cities=0,
      codename="Agent-01",
    )
    db.session.add(agent)
    db.session.commit()

    click.echo(f"✅ Agent created with id={agent.id} in {city.name}.")
