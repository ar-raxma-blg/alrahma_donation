-- Owner-uploaded photo/plan for the "The project" section on the homepage.
-- The file lives in the public "qr-codes" Storage bucket (prefix project-).
alter table public.campaign_settings add column if not exists project_image_url text not null default '';
