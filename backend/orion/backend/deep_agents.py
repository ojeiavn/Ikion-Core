import os
import toml

from typing import Literal
from deepagents import create_deep_agent
from langchain_ollama import ChatOllama
from tavily import TavilyClient
from instructions import RESEARCH_INSTRUCTIONS


config = toml.load("orion/backend/secrets.toml")
print(f"Loaded Configuration: {config}")
tavily_client = TavilyClient(api_key=config['api_keys']['TAVILY_API_KEY'])



llm = ChatOllama(model="qwen3.5:9b", temperature=0.9, top_p=0.9)

def internet_search(
    query: str,
    max_results: int = 5,
    topic: Literal["general", "news", "finance"] = "general",
    include_raw_content: bool = False,
) -> dict:
    """Run a web search"""
    return tavily_client.search(
        query=query,
        max_results=max_results,
        topic=topic,
        include_raw_content=include_raw_content,
    )
    


    
    
agent = create_deep_agent(
    tools=[internet_search],
    model=llm,
    system_prompt=RESEARCH_INSTRUCTIONS
)


result = agent.invoke({"messages": [{"role":"user", "content":"What is LM Studio?"}]})

print("Agent Result:", result["messages"])
print(result["messages"][-1]["content"])
