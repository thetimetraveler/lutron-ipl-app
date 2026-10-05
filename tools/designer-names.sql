-- SELECT-only starting point for Designer 26.6 project metadata.
-- Validate the active project's schema and that it matches the processor first.
-- Export this JSON result directly to a private rows.json; no link tables,
-- addresses, serial numbers, network keys, or credentials are selected.
-- System IDs are deliberately absent: bind one explicitly after verification.
-- Coverage is intentionally limited to these verified table relationships.
SELECT object_id, object_type, name, area_name
FROM (
  SELECT a.AreaID AS object_id, 2 AS object_type, a.Name AS name,
         CAST(NULL AS nvarchar(160)) AS area_name
  FROM dbo.tblArea a
  UNION ALL
  SELECT o.OccupancyGroupID, 38, CONCAT('Occupancy / ',o.Name), rooms.area_name
  FROM dbo.tblOccupancyGroup o
  OUTER APPLY (
    SELECT CASE WHEN COUNT(*)=1 THEN MAX(a.Name) ELSE NULL END AS area_name
    FROM dbo.tblArea a WHERE a.OccupancyGroupAssignedToID=o.OccupancyGroupID
  ) rooms
  UNION ALL
  SELECT s.ShadeGroupID, 133, s.Name, a.Name
  FROM dbo.tblShadeGroup s LEFT JOIN dbo.tblArea a ON a.AreaID=s.ParentAreaID
  UNION ALL
  SELECT z.ZoneID, z.ObjectType, z.Name, a.Name
  FROM dbo.tblZone z LEFT JOIN dbo.tblArea a ON a.AreaID=z.ParentID
  WHERE z.ObjectType IN (15,198)
  UNION ALL
  SELECT ui.ZoneControlUIID, ui.ObjectType,
         CONCAT(cs.Name, ' / ', d.Name, ' / UI ', ui.ControlNumber), a.Name
  FROM dbo.tblZoneControlUI ui
  JOIN dbo.tblControlStationDevice d ON d.ControlStationDeviceID=ui.ParentDeviceID AND ui.ParentDeviceType=5
  LEFT JOIN dbo.tblControlStation cs ON cs.ControlStationID=d.ParentControlStationID
  LEFT JOIN dbo.tblArea a ON a.AreaID=cs.ParentId
  WHERE ui.ObjectType=9 AND ui.IsSpare=0
  UNION ALL
  SELECT b.ButtonID, 57,
         CONCAT(cs.Name, ' / ', d.Name, ' / Button ', b.ButtonNumber,
                CASE WHEN NULLIF(LTRIM(RTRIM(b.Name)), '') IS NULL THEN '' ELSE CONCAT(' / ', b.Name) END), a.Name
  FROM dbo.tblKeypadButton b
  JOIN dbo.tblControlStationDevice d ON d.ControlStationDeviceID=b.ParentDeviceID AND b.ParentDeviceType=5
  LEFT JOIN dbo.tblControlStation cs ON cs.ControlStationID=d.ParentControlStationID
  LEFT JOIN dbo.tblArea a ON a.AreaID=cs.ParentId
  UNION ALL
  SELECT DISTINCT l.ObjectID, l.ObjectType, CONCAT(cs.Name,' / ',d.Name,' / Load controller'), a.Name
  FROM dbo.tblDeviceLookup l
  JOIN dbo.tblControlStationDevice d ON d.ControlStationDeviceID=l.DeviceObjectID
  LEFT JOIN dbo.tblControlStation cs ON cs.ControlStationID=d.ParentControlStationID
  LEFT JOIN dbo.tblArea a ON a.AreaID=cs.ParentId
  WHERE l.ObjectType=3
) names
WHERE NULLIF(LTRIM(RTRIM(name)), '') IS NOT NULL
ORDER BY object_type,object_id
FOR JSON PATH;
