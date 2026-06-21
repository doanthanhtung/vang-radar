UPDATE "macro_indicators"
SET
    "is_valid" = false,
    "invalid_reason" = 'DTWEXBGS is the Nominal Broad U.S. Dollar Index, not ICE DXY'
WHERE "code" = 'DXY'
  AND "source_id" IN (
    SELECT "id"
    FROM "sources"
    WHERE "code" = 'FRED'
  );
