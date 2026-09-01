# Community Geo-Discovery Architecture (Phase 6)

## 1. Overview
SmartGali Community Geo-Discovery enables hyper-local community discovery based on user GPS coordinates and custom discovery radii without exposing precise user addresses or breaching private community boundaries.

---

## 2. Data Representation & Schema
In the `communities` table, four dedicated geo fields are indexed:

```sql
ALTER TABLE communities
  ADD COLUMN latitude DECIMAL(10, 8) NULL,
  ADD COLUMN longitude DECIMAL(11, 8) NULL,
  ADD COLUMN location_name VARCHAR(255) NULL,
  ADD COLUMN discovery_radius DECIMAL(6, 2) DEFAULT 25.00 NOT NULL,
  ADD INDEX ix_communities_geo (latitude, longitude);
```

- **`latitude` & `longitude`**: Geocoded center of the community (e.g. society gate, locality center).
- **`location_name`**: Human-readable label (e.g. *"Koramangala, Bengaluru"*).
- **`discovery_radius`**: Maximum radius in kilometers within which this community is surfaced in user discovery feeds.

---

## 3. Query Flow & Distance Formula
When `GET /api/community/suggested` is called:

1. **User Coordinates Resolution**:
   - Primary: Coordinates provided in query params (`?latitude=12.9352&longitude=77.6245`).
   - Fallback: Stored coordinates from the user's `UserProfile` (`user_profiles.latitude`, `user_profiles.longitude`).

2. **Distance Calculation (Spherical Haversine in MySQL)**:
```sql
SELECT c.*, (
  6371 * acos(
    LEAST(1.0, GREATEST(-1.0,
      cos(radians(:userLat)) * cos(radians(c.latitude)) *
      cos(radians(c.longitude) - radians(:userLng)) +
      sin(radians(:userLat)) * sin(radians(c.latitude))
    ))
  )
) AS distance_km
FROM communities c
WHERE c.is_deleted = 0
  AND c.status = 'active'
  AND c.communityId NOT IN (:joinedCommunityIds)
ORDER BY distance_km ASC, c.members_count DESC
LIMIT :limit;
```

3. **Privacy & Security Boundaries**:
   - Never return exact GPS coordinates of private residential units.
   - Private communities in suggested lists display only public metadata (name, member count, category) with `is_private: true` flag so non-members must request to join.
