FROM nousresearch/hermes-agent:latest
USER root
COPY .railway/bi-agente/config.yaml /etc/bi-agente/config.yaml
COPY .railway/bi-agente/SOUL.md /etc/bi-agente/SOUL.md
RUN printf '#!/bin/bash\nset -e\nHERMES_HOME="${HERMES_HOME:-/opt/data}"\nmkdir -p "$HERMES_HOME"\ncp -f /etc/bi-agente/config.yaml "$HERMES_HOME/config.yaml"\ncp -f /etc/bi-agente/SOUL.md "$HERMES_HOME/SOUL.md"\nchown hermes:hermes "$HERMES_HOME"/{config.yaml,SOUL.md} 2>/dev/null || true\nexec /opt/hermes/docker/entrypoint.sh gateway "$@"\n' > /usr/local/bin/gateway \
 && chmod +x /usr/local/bin/gateway
