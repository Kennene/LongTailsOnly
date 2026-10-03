# Obraz demo: buduje aplikację przez ./build.sh i uruchamia ją przez ./run.sh.
#
#   docker build -t longtails .                          # build bez testów
#   docker build -t longtails --build-arg RUN_TESTS=1 .  # build.sh --test
#   docker run --rm -it -p 5173:5173 -p 8000:8000 longtails [--reset] [--fixtures]
#
# Panel: http://localhost:5173   API: http://localhost:8000/docs

# Node >= 20.19 dla Vite 8; kopiujemy tylko runtime i npm.
FROM node:24-slim AS node

FROM python:3.14-slim

COPY --from=ghcr.io/astral-sh/uv:0.12 /uv /uvx /usr/local/bin/
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/npm

RUN ln -s ../lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
    && ln -s ../lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx \
    && apt-get update \
    && apt-get install -y --no-install-recommends curl libstdc++6 \
    && rm -rf /var/lib/apt/lists/*

# build.sh i run.sh wymagają tych narzędzi; brak któregoś ma przerwać build od razu.
RUN node --version && npm --version && npx --version && uv --version && curl --version

# uv używa Pythona z obrazu zamiast pobierać własny.
ENV UV_PYTHON_DOWNLOADS=never \
    UV_LINK_MODE=copy \
    HOST=0.0.0.0

WORKDIR /app
COPY . .

ARG RUN_TESTS=
RUN ./build.sh ${RUN_TESTS:+--test}

EXPOSE 5173 8000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s \
    CMD curl -sf http://localhost:8000/health || exit 1

ENTRYPOINT ["./run.sh"]
