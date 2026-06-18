-- =========================================================
-- Self-signup + manual (invoice) billing groundwork.
--   company  : the user's company name, captured at signup. Lets the
--              admin group accounts by company for company-unit
--              invoicing later. Null for individuals.
-- Plan upgrades are arranged by emailing the admin (invoice/bank
-- transfer), so no payment columns are needed yet.
-- =========================================================

alter table app_users
  add column if not exists company text;

create index if not exists app_users_company_idx on app_users(company);
