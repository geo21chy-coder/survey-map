-- 001_sync_surveys_schema_and_data.sql
-- surveys 테이블 스키마 확인 및 기본 RLS / 데이터 정합성 설정

-- 1. surveys 테이블이 없는 경우 생성
CREATE TABLE IF NOT EXISTS surveys (
    연번 INTEGER PRIMARY KEY,
    시설명 TEXT,
    지번주소 TEXT,
    조사자 TEXT,
    조사일자 TEXT,
    실태조사 완료여부 TEXT DEFAULT '대기'
);

-- 1-1. 기존 테이블이 존재할 경우 연번 컬럼을 Primary Key로 설정 (없는 경우)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_name = 'surveys' AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE surveys ADD PRIMARY KEY (연번);
    END IF;
EXCEPTION WHEN OTHERS THEN
    -- 이미 존재하거나 오류 시 무시
    NULL;
END $$;

-- 2. RLS 활성화 및 익명(anon) 사용자 정책 설정 (조회 및 업데이트 가능하도록)
ALTER TABLE surveys ENABLE ROW LEVEL SECURITY;

DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies WHERE tablename = 'surveys' AND policyname = 'Allow public select and update'
    ) THEN
        CREATE POLICY "Allow public select and update" ON surveys
        FOR ALL
        USING (true)
        WITH CHECK (true);
    END IF;
END $$;

