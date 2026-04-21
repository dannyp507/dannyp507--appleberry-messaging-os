-- AddFacebookPermission
-- Adds a dedicated `manage_facebook` permission and assigns it to the
-- superadmin, owner, and admin roles (same roles that have manage_whatsapp).

INSERT INTO "Permission" (id, key, description, "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'manage_facebook',
  'Manage Facebook pages and Messenger',
  NOW(),
  NOW()
)
ON CONFLICT (key) DO NOTHING;

-- Assign to superadmin role
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r.slug = 'superadmin'
  AND p.key  = 'manage_facebook'
ON CONFLICT DO NOTHING;

-- Assign to owner role
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r.slug = 'owner'
  AND p.key  = 'manage_facebook'
ON CONFLICT DO NOTHING;

-- Assign to admin role
INSERT INTO "RolePermission" ("roleId", "permissionId")
SELECT r.id, p.id
FROM "Role" r
CROSS JOIN "Permission" p
WHERE r.slug = 'admin'
  AND p.key  = 'manage_facebook'
ON CONFLICT DO NOTHING;
