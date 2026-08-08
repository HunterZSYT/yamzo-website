-- Yamzo starts closed: only the narrow api schema is intended for PostgREST.
-- Keep this migration first so later objects inherit deny-by-default ACLs.

create schema if not exists extensions authorization postgres;
create extension if not exists pgcrypto with schema extensions;

create schema if not exists app authorization postgres;
create schema if not exists private authorization postgres;
create schema if not exists api authorization postgres;

comment on schema app is 'Yamzo business data; not directly exposed by PostgREST.';
comment on schema private is 'PII, credentials, abuse controls, and integration internals.';
comment on schema api is 'Explicit views and RPCs exposed through the Supabase Data API.';

revoke create on schema public from public;
revoke all on schema public from anon, authenticated;
revoke all on schema app from public, anon, authenticated;
revoke all on schema private from public, anon, authenticated;
revoke all on schema api from public, anon, authenticated;

grant usage on schema app, private, api to service_role;

alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema app
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema app
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema app
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema private
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema private
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema api
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema api
  revoke all on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema api
  revoke execute on functions from public, anon, authenticated;

alter default privileges for role postgres in schema app
  grant all on tables to service_role;
alter default privileges for role postgres in schema app
  grant all on sequences to service_role;
alter default privileges for role postgres in schema app
  grant execute on functions to service_role;

alter default privileges for role postgres in schema private
  grant all on tables to service_role;
alter default privileges for role postgres in schema private
  grant all on sequences to service_role;
alter default privileges for role postgres in schema private
  grant execute on functions to service_role;

alter default privileges for role postgres in schema api
  grant all on tables to service_role;
alter default privileges for role postgres in schema api
  grant all on sequences to service_role;
alter default privileges for role postgres in schema api
  grant execute on functions to service_role;
