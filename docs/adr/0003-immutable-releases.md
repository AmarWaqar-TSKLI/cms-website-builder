# ADR-0003: Immutable releases + content-addressed cache

**Status:** Accepted

## Context

A CMS that caches rendered pages by URL must purge on every publish, and can't
roll back without a second purge and a cold cache — and the cost of both grows
with the size of the site. We want publish and rollback to be O(1) and instant.

## Decision

A **release** is an immutable, site-wide snapshot: a manifest (`release_items`)
pinning exactly which revision of which page/component/theme it contains, plus
frozen Tier-2 data. Two lookups serve a request:

1. **The pointer** — `sites.live_release_id`. Read fresh on every request, never
   cached (it's the one mutable value, moved by the build worker).
2. **The content** — keyed by the immutable release id, cached forever with **no
   invalidation logic anywhere**, because no event can ever require any.

Publishing writes a new release + a build job (claimed by a separate worker
process). Rollback is `UPDATE sites SET live_release_id = <older release>`.

## Consequences

- **+** Rollback purges nothing, warms nothing, rebuilds nothing. The old version
  was never evicted — it's restored by pointing at it again.
- **+** The cache can be an in-process `Map`, Redis, or a CDN without changing the
  argument: the key is content-addressed, so two servers can't disagree and a
  stale read is impossible by construction.
- **+** Publish returns before the build finishes; the current version stays live
  until the new one is ready.
- **−** The in-process cache isn't shared across instances today (a miss costs one
  query, never a wrong answer). Moving it to Redis/CDN is a drop-in the design
  already assumes.
