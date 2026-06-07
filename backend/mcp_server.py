#!/usr/bin/env python3
"""MCP server — exposes the password manager vault as Claude tools.

Requires the FastAPI backend to be running on 127.0.0.1:8765.
Register with Claude Code:
  claude mcp add password-manager -- wsl bash -c \
    "cd /mnt/c/Users/srist/Downloads/password-manager/backend && \
     .venv-linux/bin/python mcp_server.py"
"""
import asyncio
import json
import urllib.error
import urllib.request

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp import types

API = "http://127.0.0.1:8765"
_token: str | None = None


def _headers() -> dict:
    h = {"Content-Type": "application/json"}
    if _token:
        h["Authorization"] = f"Bearer {_token}"
    return h


def _request(method: str, path: str, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{API}{path}", data=data, headers=_headers(), method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        detail = json.loads(e.read()).get("detail", str(e))
        raise RuntimeError(detail)


def _text(content: str) -> list:
    return [types.TextContent(type="text", text=content)]


server = Server("password-manager")


@server.list_tools()
async def list_tools():
    return [
        types.Tool(
            name="unlock",
            description="Unlock the vault with the master password. Call this first.",
            inputSchema={
                "type": "object",
                "properties": {
                    "master_password": {"type": "string", "description": "The vault master password"},
                },
                "required": ["master_password"],
            },
        ),
        types.Tool(
            name="list_entries",
            description="List all vault entries (id, title, username, url). Passwords are not included.",
            inputSchema={"type": "object", "properties": {}},
        ),
        types.Tool(
            name="get_entry",
            description="Get full details of an entry including its password and secret.",
            inputSchema={
                "type": "object",
                "properties": {
                    "id": {"type": "integer", "description": "Entry ID from list_entries"},
                },
                "required": ["id"],
            },
        ),
        types.Tool(
            name="create_entry",
            description="Create a new vault entry.",
            inputSchema={
                "type": "object",
                "properties": {
                    "title":    {"type": "string"},
                    "username": {"type": "string"},
                    "password": {"type": "string"},
                    "url":      {"type": "string"},
                    "secret":   {"type": "string", "description": "API token or secret key"},
                    "notes":    {"type": "string"},
                },
                "required": ["title"],
            },
        ),
        types.Tool(
            name="update_entry",
            description="Update one or more fields of an existing entry.",
            inputSchema={
                "type": "object",
                "properties": {
                    "id":       {"type": "integer"},
                    "title":    {"type": "string"},
                    "username": {"type": "string"},
                    "password": {"type": "string"},
                    "url":      {"type": "string"},
                    "secret":   {"type": "string"},
                    "notes":    {"type": "string"},
                },
                "required": ["id"],
            },
        ),
        types.Tool(
            name="delete_entry",
            description="Permanently delete a vault entry.",
            inputSchema={
                "type": "object",
                "properties": {
                    "id": {"type": "integer"},
                },
                "required": ["id"],
            },
        ),
    ]


@server.call_tool()
async def call_tool(name: str, arguments: dict):
    global _token
    try:
        if name == "unlock":
            result = _request("POST", "/unlock", {"master_password": arguments["master_password"]})
            _token = result["token"]
            return _text("Vault unlocked.")

        if not _token:
            return _text("Vault is locked — call the unlock tool first.")

        if name == "list_entries":
            entries = _request("GET", "/entries")
            safe = [
                {"id": e["id"], "title": e["title"], "username": e.get("username"), "url": e.get("url")}
                for e in entries
            ]
            return _text(json.dumps(safe, indent=2))

        if name == "get_entry":
            entry = _request("GET", f"/entries/{arguments['id']}")
            # Copy secrets to clipboard via clip.exe instead of returning them in plaintext.
            # This keeps passwords out of the conversation log.
            clipped = []
            for field in ("password", "secret"):
                value = entry.get(field)
                if value:
                    import subprocess
                    subprocess.run(["clip.exe"], input=value.encode(), check=False)
                    clipped.append(field)
                    entry[field] = f"<copied to clipboard>"
            note = f" ({', '.join(clipped)} copied to clipboard)" if clipped else ""
            safe = {k: v for k, v in entry.items() if k not in ("password", "secret")}
            safe.update({f: "<copied to clipboard>" for f in clipped})
            return _text(json.dumps(safe, indent=2) + note)

        if name == "create_entry":
            entry = _request("POST", "/entries", arguments)
            return _text(f"Created entry (id={entry['id']}).")

        if name == "update_entry":
            entry_id = arguments.pop("id")
            _request("PATCH", f"/entries/{entry_id}", arguments)
            return _text(f"Updated entry {entry_id}.")

        if name == "delete_entry":
            _request("DELETE", f"/entries/{arguments['id']}")
            return _text(f"Deleted entry {arguments['id']}.")

        return _text(f"Unknown tool: {name}")

    except RuntimeError as e:
        return _text(f"Error: {e}")


async def main():
    async with stdio_server() as (read_stream, write_stream):
        await server.run(read_stream, write_stream, server.create_initialization_options())


if __name__ == "__main__":
    asyncio.run(main())
