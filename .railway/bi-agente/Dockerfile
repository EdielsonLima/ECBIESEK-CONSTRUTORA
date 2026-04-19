FROM nousresearch/hermes-agent:latest
USER root
RUN mkdir -p /etc/bi-agente/skills
# Deps Python (psycopg2-binary, httpx) sao instaladas pelo gateway em runtime
# pois pip nao esta no PATH padrao da imagem - gateway descobre venv correto.
COPY config.yaml /etc/bi-agente/config.yaml
COPY SOUL.md /etc/bi-agente/SOUL.md
COPY skills-staging/bi-agente/ /etc/bi-agente/skills/productivity/bi-agente/
COPY gateway /usr/local/bin/gateway
RUN chmod +x /usr/local/bin/gateway
