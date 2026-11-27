-- 003: categorii noi (chei stabile, traduse în aplicație) și recap lunar.
-- Se poate rula de mai multe ori.

-- 1) Categoriile vechi → cele 4 noi.
UPDATE tasks SET category = CASE
        WHEN category IN ('SPORT', 'Sport', 'Sănătate') THEN 'SPORT'
        WHEN category IN ('STUDY', 'Facultate', 'Proiect Echipă') THEN 'STUDY'
        WHEN category = 'ENTERTAINMENT' THEN 'ENTERTAINMENT'
        ELSE 'CHORES'
    END
WHERE category IS NULL OR category NOT IN ('SPORT', 'STUDY', 'CHORES', 'ENTERTAINMENT');
ALTER TABLE tasks ALTER COLUMN category SET DEFAULT 'CHORES';

-- 2) Recap: fiecare finalizare își păstrează categoria, chiar dacă activitatea e ștearsă ulterior.
ALTER TABLE task_completions ADD COLUMN IF NOT EXISTS category VARCHAR(40);
UPDATE task_completions c SET category = t.category
FROM tasks t
WHERE t.id = c.task_id AND c.category IS NULL;
UPDATE task_completions SET category = 'CHORES' WHERE category IS NULL;

ALTER TABLE task_completions ALTER COLUMN task_id DROP NOT NULL;
DO $$
DECLARE
    fk TEXT;
BEGIN
    SELECT con.conname INTO fk
    FROM pg_constraint con
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = ANY (con.conkey)
    WHERE con.conrelid = 'task_completions'::regclass AND con.contype = 'f' AND att.attname = 'task_id';
    IF fk IS NOT NULL THEN
        EXECUTE format('ALTER TABLE task_completions DROP CONSTRAINT %I', fk);
    END IF;
    ALTER TABLE task_completions ADD CONSTRAINT task_completions_task_id_fkey
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL;
END $$;
