-- bootstrap_platform_admin.sql
-- El ÚNICO insert manual que queda en el producto. Se corre una sola vez,
-- después de aplicar 0019_platform_roles.sql.
--
-- POR QUÉ HACE FALTA
--   La RLS de `platform_members` (0019) exige ser administrador de plataforma
--   para insertar en `platform_members`. Es exactamente lo que se quiere: sin
--   esa regla, cualquier usuario registrado podría auto-otorgarse acceso a
--   todas las inmobiliarias. Pero deja un problema de arranque: la primera
--   fila no la puede crear nadie desde adentro del sistema.
--
--   Este snippet la crea desde afuera, con la service key (SQL editor de
--   Supabase o `psql` como superusuario), que bypassea la RLS. De ahí en más
--   todo se gestiona desde el panel, en /admin/team, y esta hoja no se vuelve
--   a usar.
--
-- CÓMO SE CORRE
--   1. La dueña tiene que tener cuenta creada en el panel (o sea, existir en
--      `auth.users`). Si todavía no se registró, esto no encuentra nada y no
--      inserta nada: no falla, no hace ruido. Registrarse y volver a correrlo.
--   2. Cambiar el mail de abajo por el suyo, en minúsculas.
--   3. Correrlo en el SQL editor del Supabase del VPS.
--   4. Verificar con la consulta del final que devuelva exactamente una fila.
--
-- SEGURIDAD
--   `created_by` queda NULL a propósito: nadie de adentro otorgó este permiso,
--   vino del arranque del sistema. Es la única fila de la tabla que va a tener
--   ese hueco, y eso mismo la identifica en una auditoría.

insert into platform_members (user_id, role, created_by)
select u.id, 'admin'::platform_role, null
from auth.users u
where lower(u.email) = lower('CAMBIAR@POR-EL-MAIL-DE-LA-DUENA.com')
on conflict (user_id) do update set role = 'admin';

-- Verificación: tiene que devolver una fila, con el mail correcto y rol admin.
select pm.user_id, u.email, pm.role, pm.created_at
from platform_members pm
join auth.users u on u.id = pm.user_id
order by pm.created_at;
