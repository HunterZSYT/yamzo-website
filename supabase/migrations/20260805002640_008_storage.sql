insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values
  (
    'menu-media',
    'menu-media',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
  ),
  (
    'site-media',
    'site-media',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[]
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "yamzo public media is readable"
on storage.objects for select
to anon, authenticated
using (bucket_id in ('menu-media', 'site-media'));

create policy "catalog staff can upload menu media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'menu-media'
  and private.current_staff_has_permission('catalog.manage')
  and name !~ '(^|/)\.\.(/|$)'
  and name !~ '^/'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
);

create policy "catalog staff can update menu media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'menu-media'
  and private.current_staff_has_permission('catalog.manage')
)
with check (
  bucket_id = 'menu-media'
  and private.current_staff_has_permission('catalog.manage')
  and name !~ '(^|/)\.\.(/|$)'
  and name !~ '^/'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
);

create policy "catalog staff can delete menu media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'menu-media'
  and private.current_staff_has_permission('catalog.manage')
);

create policy "merchandising staff can upload site media"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'site-media'
  and private.current_staff_has_permission('merchandising.manage')
  and name !~ '(^|/)\.\.(/|$)'
  and name !~ '^/'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
);

create policy "merchandising staff can update site media"
on storage.objects for update
to authenticated
using (
  bucket_id = 'site-media'
  and private.current_staff_has_permission('merchandising.manage')
)
with check (
  bucket_id = 'site-media'
  and private.current_staff_has_permission('merchandising.manage')
  and name !~ '(^|/)\.\.(/|$)'
  and name !~ '^/'
  and lower(storage.extension(name)) in ('jpg', 'jpeg', 'png', 'webp', 'avif')
);

create policy "merchandising staff can delete site media"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'site-media'
  and private.current_staff_has_permission('merchandising.manage')
);
