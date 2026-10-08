insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('imagenes', 'imagenes', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "imagenes: lectura publica" on storage.objects;
create policy "imagenes: lectura publica" on storage.objects for select
  using (bucket_id = 'imagenes');

drop policy if exists "imagenes: admin sube" on storage.objects;
create policy "imagenes: admin sube" on storage.objects for insert to authenticated
  with check (bucket_id = 'imagenes' and public.rol_actual() = 'admin');

drop policy if exists "imagenes: admin modifica" on storage.objects;
create policy "imagenes: admin modifica" on storage.objects for update to authenticated
  using (bucket_id = 'imagenes' and public.rol_actual() = 'admin');

drop policy if exists "imagenes: admin borra" on storage.objects;
create policy "imagenes: admin borra" on storage.objects for delete to authenticated
  using (bucket_id = 'imagenes' and public.rol_actual() = 'admin');
