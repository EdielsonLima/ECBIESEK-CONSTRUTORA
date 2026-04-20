import time
import pytest
from rate_limiter import RateLimiter, RateLimitExcedido

def test_permite_abaixo_do_limite():
    rl = RateLimiter(max_por_minuto_por_chave=10, max_global_por_minuto=30)
    for _ in range(5):
        rl.check("user_a")  # nao levanta

def test_bloqueia_acima_do_limite_por_chave():
    rl = RateLimiter(max_por_minuto_por_chave=3, max_global_por_minuto=30)
    for _ in range(3):
        rl.check("user_a")
    with pytest.raises(RateLimitExcedido, match="por usuario"):
        rl.check("user_a")

def test_bloqueia_global():
    rl = RateLimiter(max_por_minuto_por_chave=1000, max_global_por_minuto=2)
    rl.check("a"); rl.check("b")
    with pytest.raises(RateLimitExcedido, match="global"):
        rl.check("c")

def test_libera_apos_janela(monkeypatch):
    rl = RateLimiter(max_por_minuto_por_chave=1, max_global_por_minuto=100)
    t = [0.0]
    monkeypatch.setattr(time, "monotonic", lambda: t[0])
    rl.check("u")
    with pytest.raises(RateLimitExcedido):
        rl.check("u")
    t[0] = 61.0  # avanca 61s
    rl.check("u")  # nao levanta
