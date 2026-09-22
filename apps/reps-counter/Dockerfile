# The CRW+ rep counter: a small stdlib Python server that hands out the web counter
# (pose detection runs in the browser) and does the 1v1 / 2v2 matchmaking.
FROM python:3.12-slim
ENV PYTHONUNBUFFERED=1
WORKDIR /app
COPY pushups ./pushups
COPY web ./web
RUN mkdir -p data && useradd --system --home /app counter && chown -R counter /app
USER counter
EXPOSE 8000
# The public HTTPS address comes from a Cloudflare tunnel outside the container.
CMD ["python", "-m", "pushups.server", "--port", "8000", "--target", "20"]
