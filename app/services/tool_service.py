from app.extensions import db
from app.models.agent import Agent
from app.models.tool import Tool

def use_tool(agent: Agent, tool_code: str) -> bool:
    tool = Tool.query.filter_by(code=tool_code).first()
    if not tool:
        return False

    # kontrola, jestli má agent na to "zaplatit"
    if agent.energy < tool.energy_cost:
        return False
    if agent.material < tool.material_cost:
        return False

    # strhni náklady
    agent.energy -= tool.energy_cost
    agent.material -= tool.material_cost

    # přičti zisky
    agent.energy += tool.energy_gain
    agent.material += tool.material_gain
    agent.data += tool.data_gain

    db.session.commit()
    return True
