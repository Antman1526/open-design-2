# Private SearXNG For Open Design

This folder is a copyable local SearXNG deployment for Open Design web research.
It binds to `127.0.0.1:8889`, enables JSON output, and is intended to be used by
the Kindly Web Search MCP server through `SEARXNG_BASE_URL`.

## Start

```bash
cd deploy/searxng-private
mkdir -p searxng
cp searxng/settings.yml.example searxng/settings.yml
perl -0pi -e "s/REPLACE_WITH_OPENSSL_RAND_HEX_32/$(openssl rand -hex 32)/" searxng/settings.yml
docker compose up -d
```

## Test

```bash
curl "http://127.0.0.1:8889/search?q=Open%20Design%20local%20LLM&format=json"
```

The response should be JSON and should include a `results` array.
