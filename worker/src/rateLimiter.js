function getCurrentBuckets(nowMs) {
  const second = Math.floor(nowMs / 1000);
  return {
    minute: Math.floor(second / 60),
    hour: Math.floor(second / 3600)
  };
}

function bucketRetryAfterSeconds(type, bucket, nowMs) {
  const currentSec = Math.floor(nowMs / 1000);
  if (type === "minute") {
    return Math.max(1, (bucket + 1) * 60 - currentSec);
  }
  return Math.max(1, (bucket + 1) * 3600 - currentSec);
}

function secondsUntilNextUtcDay(nowMs) {
  const now = new Date(nowMs);
  const nextUtcDayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0,
    0,
    0
  );
  return Math.max(1, Math.ceil((nextUtcDayStart - nowMs) / 1000));
}

export class RateLimiterDO {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return new Response(JSON.stringify({ ok: false, error: "Invalid body" }), { status: 400 });
    }

    if (pathname === "/daily-credit") {
      const now = Date.now();
      const scope = String(body.scope || "credits");
      const key = String(body.key || "");
      const day = String(body.day || "");
      const limit = Math.max(1, Number(body.limit || 0));
      const cost = Math.max(1, Number(body.cost || 0));
      if (!scope || !key || !day || !Number.isFinite(limit) || !Number.isFinite(cost)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid daily credit body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const storageKey = `${scope}:${key}:d:${day}`;
      const used = Number(await this.state.storage.get(storageKey)) || 0;
      if (used + cost > limit) {
        return new Response(
          JSON.stringify({
            ok: false,
            limited: true,
            used,
            remaining: Math.max(0, limit - used),
            limit,
            retryAfter: secondsUntilNextUtcDay(now)
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      const nextUsed = used + cost;
      await this.state.storage.put(storageKey, nextUsed, {
        expiration: Math.floor(now / 1000) + 60 * 60 * 24 * 3
      });
      return new Response(
        JSON.stringify({
          ok: true,
          limited: false,
          used: nextUsed,
          remaining: Math.max(0, limit - nextUsed),
          limit,
          retryAfter: 0
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    if (pathname === "/daily-credit/status") {
      const now = Date.now();
      const scope = String(body.scope || "credits");
      const key = String(body.key || "");
      const day = String(body.day || "");
      const limit = Math.max(1, Number(body.limit || 0));
      if (!scope || !key || !day || !Number.isFinite(limit)) {
        return new Response(JSON.stringify({ ok: false, error: "Invalid daily credit status body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }
      const storageKey = `${scope}:${key}:d:${day}`;
      const used = Number(await this.state.storage.get(storageKey)) || 0;
      return new Response(
        JSON.stringify({
          ok: true,
          limited: used >= limit,
          used,
          remaining: Math.max(0, limit - used),
          limit,
          retryAfter: used >= limit ? secondsUntilNextUtcDay(now) : 0
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    }

    const now = Date.now();
    const { minute: minuteBucket, hour: hourBucket } = getCurrentBuckets(now);
    const scope = String(body.scope || "unknown");
    const key = String(body.key || "");
    const minuteLimit = Number(body.minuteLimit || 0);
    const hourLimit = Number(body.hourLimit || 0);
    if (!key || !scope) {
      return new Response(JSON.stringify({ ok: false, error: "Missing rate key" }), { status: 400 });
    }

    let retryAfter = 0;
    let limited = false;

    if (minuteLimit > 0) {
      const minuteStorageKey = `${scope}:${key}:m:${minuteBucket}`;
      const minuteCount = (Number(await this.state.storage.get(minuteStorageKey)) || 0) + 1;
      await this.state.storage.put(minuteStorageKey, minuteCount, {
        expiration: Math.floor(now / 1000) + 120
      });
      if (minuteCount > minuteLimit) {
        limited = true;
        retryAfter = Math.max(retryAfter, bucketRetryAfterSeconds("minute", minuteBucket, now));
      }
    }

    if (hourLimit > 0) {
      const hourStorageKey = `${scope}:${key}:h:${hourBucket}`;
      const hourCount = (Number(await this.state.storage.get(hourStorageKey)) || 0) + 1;
      await this.state.storage.put(hourStorageKey, hourCount, {
        expiration: Math.floor(now / 1000) + 7200
      });
      if (hourCount > hourLimit) {
        limited = true;
        retryAfter = Math.max(retryAfter, bucketRetryAfterSeconds("hour", hourBucket, now));
      }
    }

    return new Response(
      JSON.stringify({
        ok: !limited,
        limited,
        retryAfter
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }
}
