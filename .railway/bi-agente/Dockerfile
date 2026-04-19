FROM nousresearch/hermes-agent:latest
USER root
RUN mkdir -p /etc/bi-agente/skills
RUN pip install --no-cache-dir psycopg2-binary httpx
COPY config.yaml /etc/bi-agente/config.yaml
COPY SOUL.md /etc/bi-agente/SOUL.md
COPY skills-staging/bi-agente/ /etc/bi-agente/skills/productivity/bi-agente/
COPY gateway /usr/local/bin/gateway
RUN chmod +x /usr/local/bin/gateway
