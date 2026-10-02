-- Store the Random Forest probability for each newly classified sensor record.
ALTER TABLE public.posture_data
ADD COLUMN IF NOT EXISTS confidence double precision;
