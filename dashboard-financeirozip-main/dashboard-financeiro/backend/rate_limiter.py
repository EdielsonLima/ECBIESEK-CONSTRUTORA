"""Rate limiter em memoria com janela deslizante de 60s.

Limitacao conhecida: o estado e por processo. Em deploys com multiplos
workers uvicorn/gunicorn cada worker tem seu proprio contador, entao o
limite efetivo e `max * num_workers`. Redeploys/restarts zeram o estado.
Para limites rigidos compartilhados, migrar para Redis/Postgres.
"""
import time
from collections import defaultdict, deque


class RateLimitExcedido(Exception):
    pass


class RateLimiter:
    def __init__(self, max_por_minuto_por_chave: int, max_global_por_minuto: int):
        self.max_chave = max_por_minuto_por_chave
        self.max_global = max_global_por_minuto
        self._por_chave: dict[str, deque[float]] = defaultdict(deque)
        self._global: deque[float] = deque()

    def check(self, chave: str) -> None:
        """Registra um hit. Levanta RateLimitExcedido se ultrapassar."""
        agora = time.monotonic()
        corte = agora - 60.0
        self._limpar(self._global, corte)
        self._limpar(self._por_chave[chave], corte)

        if len(self._global) >= self.max_global:
            raise RateLimitExcedido(
                f"Limite global excedido: {self.max_global}/min"
            )
        if len(self._por_chave[chave]) >= self.max_chave:
            raise RateLimitExcedido(
                f"Limite por usuario excedido: {self.max_chave}/min para {chave}"
            )

        self._global.append(agora)
        self._por_chave[chave].append(agora)

    @staticmethod
    def _limpar(dq: deque, corte: float) -> None:
        while dq and dq[0] < corte:
            dq.popleft()
