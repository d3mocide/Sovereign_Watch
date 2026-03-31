#!/usr/bin/env python3
"""
manage.py — Sovereign Watch management CLI.

Intended for headless / automated deployments and break-glass admin recovery.
Run inside the backend container:

  docker exec -it sovereign-backend python manage.py create-admin
  docker exec -it sovereign-backend python manage.py create-admin --username ops

The password is always prompted interactively so it never appears in shell
history, process lists, or environment variables.
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import sys

# Ensure the app modules are importable regardless of cwd.
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import asyncpg  # noqa: E402 (must come after sys.path fix)

from core.auth import hash_password  # noqa: E402
from core.config import settings  # noqa: E402


# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------


async def _create_admin(username: str, password: str) -> None:
    conn = await asyncpg.connect(settings.DB_DSN)
    try:
        row = await conn.fetchrow(
            "INSERT INTO users (username, hashed_password, role, is_active) "
            "VALUES ($1, $2, 'admin', TRUE) "
            "ON CONFLICT (username) DO NOTHING "
            "RETURNING id, username, role",
            username,
            hash_password(password),
        )
        if row:
            print(f"Admin account '{row['username']}' created (id={row['id']}).")
        else:
            print(
                f"Username '{username}' already exists — no changes made.\n"
                "To reset the password use PATCH /api/auth/users/<id> as an admin."
            )
    finally:
        await conn.close()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Sovereign Watch management CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p_create = sub.add_parser(
        "create-admin",
        help="Create an admin account (or recover access when no admins remain)",
    )
    p_create.add_argument(
        "--username",
        default="admin",
        help="Username for the new admin account (default: admin)",
    )

    args = parser.parse_args()

    if args.command == "create-admin":
        password = getpass.getpass(f"Password for '{args.username}': ")
        confirm = getpass.getpass("Confirm password: ")
        if password != confirm:
            print("Error: passwords do not match.", file=sys.stderr)
            sys.exit(1)
        if len(password) < 8:
            print("Error: password must be at least 8 characters.", file=sys.stderr)
            sys.exit(1)
        asyncio.run(_create_admin(args.username, password))


if __name__ == "__main__":
    main()
