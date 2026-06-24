const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

// 1. Supabase 연결 설정
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function syncData() {
    try {
        console.log('--- 데이터 업로드 시작 ---');
        
        // 2. 로컬 파일 읽기
        if (!fs.existsSync('survey_data.json')) {
            console.error('오류: survey_data.json 파일이 없습니다. 먼저 엑셀 분석을 진행해주세요.');
            return;
        }

        const rawData = JSON.parse(fs.readFileSync('survey_data.json', 'utf-8'));
        const localRows = rawData.data || rawData;

        if (!localRows || localRows.length === 0) {
            console.log('업로드할 데이터가 없습니다.');
            return;
        }

        console.log(`총 ${localRows.length}개의 데이터를 분석 중...`);

        // 3. 컬럼 이름 매핑 (데이터베이스 컬럼명에 맞춰서 변환)
        // 팁: DB 컬럼명에 공백이나 특수문자가 있으면 정확히 일치해야 합니다.
        const rowsToUpload = localRows.map(row => {
            // Supabase confirmed columns: 연번, 실태조사 완료여부, 시설명, 지번주소, 조사자, 조사일자
            const mapped = {
                '연번': row['연번'],
                '실태조사 완료여부': row['실태조사 완료여부'] || '대기',
                '시설명': row['시설명'],
                '지번주소': row['지번주소'] || row['도로명주소'] || '주소 없음',
                '조사자': row['조사자5'] || row['조사자'] || '미지정',
                '조사일자': row['조사일자5'] || row['조사일자'] || null
            };
            return mapped;
        });

        // 4. Supabase로 업로드 (Insert)
        const { data, error } = await supabase
            .from('surveys')
            .insert(rowsToUpload);

        if (error) {
            console.error('업로드 실패 상세 정보:');
            console.error(`에러 메시지: ${error.message}`);
            console.error(`에러 코드: ${error.code}`);
            console.error('도움말: Supabase 테이블의 컬럼 이름이 [연번, 실태조사 완료여부, 시설명, 지번주소, 도로명주소, 조사자, 조사일자]와 일치하는지 확인하세요.');
            return;
        }

        console.log('--- 업로드 완료! ---');
        console.log(`${localRows.length}개의 데이터가 성공적으로 동기화되었습니다.`);

    } catch (e) {
        console.error('예기치 못한 오류 발생:', e.message);
    }
}

syncData();
