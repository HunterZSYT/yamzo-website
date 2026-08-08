# Migration and rollback notes

These migrations are forward-only and ordered. Production rollback should
normally be a reviewed forward-fix because the order tables are an audit and
fulfillment system of record.

Before the first remote apply:

1. Confirm the remote project is still empty or reconcile an explicit schema
   diff.
2. Capture a schema-only dump and verify the platform backup/PITR state.
3. Apply in a preview branch or disposable local stack first.
4. Run pgTAP, database lint, security advisors, performance advisors, and a
   storefront/POS contract smoke test.
5. Configure the Data API exposed schema as `api`; do not expose `app` or
   `private`.

If a migration fails, stop at the failing version. Do not delete migration
history or manually mark it complete. Fix the statement in a new migration if
any remote transaction committed; otherwise correct the unapplied local file
and replay from a clean branch.

Destructive teardown is acceptable only on an empty disposable database with
explicit approval. A production rollback must preserve `app.orders`, line
snapshots, status events, `private.order_contacts`, audit rows, print jobs, and
outbox state. Storage bucket deletion is a separate destructive operation and
is never part of an automatic schema rollback.

The only intentional hard-delete path is
`api.hard_delete_test_order`; it rejects live orders, requires an exact order
reference confirmation, and retains a non-PII audit tombstone.
