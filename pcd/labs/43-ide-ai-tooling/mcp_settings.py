"""Lab 43: add or remove the Pub/Sub remote MCP server in ~/.gemini/settings.json.

Agent mode in VS Code reads its MCP servers from the mcpServers key of this file.
The script changes only the lab43-pubsub entry. It keeps your other settings.
Usage: python3 mcp_settings.py add PROJECT_ID | remove
"""
import json
import pathlib
import sys

SETTINGS = pathlib.Path.home() / ".gemini" / "settings.json"
NAME = "lab43-pubsub"  # the server name that /mcp shows

def pubsub_server(project_id):
    # The fields follow the Gemini CLI sample in "Configure MCP in an AI application".
    return {
        "httpUrl": "https://pubsub.googleapis.com/mcp",  # the global endpoint (GA)
        "authProviderType": "google_credentials",  # tokens come from your ADC: no key here
        "oauth": {"scopes": ["https://www.googleapis.com/auth/pubsub"]},
        "timeout": 30000,
        "headers": {"x-goog-user-project": project_id},  # the quota project of each request
    }

def main(args):
    if not (args == ["remove"] or (len(args) == 2 and args[0] == "add")):
        sys.exit(__doc__)
    if args == ["remove"] and not SETTINGS.exists():
        return print(f"{SETTINGS} does not exist. There is nothing to remove.")
    try:
        settings = json.loads(SETTINGS.read_text()) if SETTINGS.exists() else {}
    except json.JSONDecodeError as err:  # for example, a file with comments
        sys.exit(f"{SETTINGS} is not plain JSON ({err}). Edit the file by hand.")
    servers = settings.setdefault("mcpServers", {})
    if args[0] == "add":
        servers[NAME] = pubsub_server(args[1])
        # Print only this entry: other entries can hold tokens.
        print(json.dumps({NAME: servers[NAME]}, indent=2))
    elif servers.pop(NAME, None) is None:
        return print(f"{NAME} is not in {SETTINGS}. There is nothing to remove.")
    if not servers:
        del settings["mcpServers"]
    SETTINGS.parent.mkdir(exist_ok=True)
    SETTINGS.write_text(json.dumps(settings, indent=2) + "\n")
    print(f"Updated {SETTINGS}. In VS Code, run the command Developer: Reload Window.")

if __name__ == "__main__":
    main(sys.argv[1:])
