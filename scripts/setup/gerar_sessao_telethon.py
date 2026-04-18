"""Gera TELETHON_SESSION_STRING em dois passos via env vars.

Passo 1 - envia SMS:
    TELEGRAM_API_ID=... TELEGRAM_API_HASH=... TELEGRAM_PHONE=+556... python gerar_sessao_telethon.py
    -> salva .telethon_state com phone_code_hash

Passo 2 - completa com o codigo recebido:
    TELEGRAM_CODE=12345 python gerar_sessao_telethon.py
    -> imprime TELETHON_SESSION_STRING
"""
import os
import json
import asyncio
from telethon import TelegramClient
from telethon.sessions import StringSession

API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
STATE_FILE = os.path.join(os.path.dirname(__file__), ".telethon_state")


async def passo1_envia_sms(phone: str):
    client = TelegramClient(StringSession(), API_ID, API_HASH)
    await client.connect()
    result = await client.send_code_request(phone)
    state = {
        "phone": phone,
        "phone_code_hash": result.phone_code_hash,
        "session": client.session.save(),
    }
    with open(STATE_FILE, "w") as f:
        json.dump(state, f)
    await client.disconnect()
    print(f"[ok] SMS enviado para {phone}")
    print("Agora rode com TELEGRAM_CODE=<codigo> para completar.")


async def passo2_completa(code: str):
    with open(STATE_FILE) as f:
        state = json.load(f)
    client = TelegramClient(StringSession(state["session"]), API_ID, API_HASH)
    await client.connect()
    password = os.environ.get("TELEGRAM_2FA")
    try:
        await client.sign_in(state["phone"], code, phone_code_hash=state["phone_code_hash"])
    except Exception as e:
        if "2FA" in str(e) or "password" in str(e).lower():
            if not password:
                print("[erro] 2FA ativo. Rode com TELEGRAM_2FA=<senha>")
                await client.disconnect()
                return
            await client.sign_in(password=password)
        else:
            raise
    me = await client.get_me()
    session_string = client.session.save()
    await client.disconnect()
    os.remove(STATE_FILE)
    print("\n=== SUCESSO ===")
    print(f"Conta: {me.first_name} (id={me.id}, @{me.username or '-'})")
    print(f"\nTELEGRAM_USER_ID_BRIDGE={me.id}")
    print(f"\nTELETHON_SESSION_STRING={session_string}")
    print("\nColar esses dois valores no Railway. NAO commitar.")


if __name__ == "__main__":
    code = os.environ.get("TELEGRAM_CODE")
    phone = os.environ.get("TELEGRAM_PHONE")
    if code:
        asyncio.run(passo2_completa(code))
    elif phone:
        asyncio.run(passo1_envia_sms(phone))
    else:
        print("Uso:")
        print("  Passo 1: TELEGRAM_PHONE=+556... python gerar_sessao_telethon.py")
        print("  Passo 2: TELEGRAM_CODE=12345 python gerar_sessao_telethon.py")
