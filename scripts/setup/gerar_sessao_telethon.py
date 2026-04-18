"""Faz login interativo no Telegram via Telethon e imprime o
TELETHON_SESSION_STRING para colar no Railway.

Rodar 1x localmente (pede SMS):
    pip install telethon
    python scripts/setup/gerar_sessao_telethon.py
"""
import os
import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ.get("TELEGRAM_API_ID") or input("TELEGRAM_API_ID: "))
API_HASH = os.environ.get("TELEGRAM_API_HASH") or input("TELEGRAM_API_HASH: ")

async def main():
    async with TelegramClient(StringSession(), API_ID, API_HASH) as client:
        me = await client.get_me()
        session_string = client.session.save()
        print("\n=== SUCESSO ===")
        print(f"Conta: {me.first_name} (id={me.id}, @{me.username or '-'})")
        print(f"\nTELEGRAM_USER_ID_BRIDGE={me.id}")
        print(f"\nTELETHON_SESSION_STRING={session_string}")
        print("\nColar esses dois valores no Railway (projeto BI e bi-agente).")
        print("IMPORTANTE: nao commitar, nao colar no chat.")

if __name__ == "__main__":
    asyncio.run(main())
