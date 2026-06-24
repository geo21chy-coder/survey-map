const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_KEY
);

async function clearAndSync() {
    try {
        console.log('--- [1/3] 기존 데이터 삭제 시작 ---');
        
        // 1. 기존 데이터 전체 삭제 (연번이 0보다 큰 모든 데이터 삭제)
        const { error: deleteError } = await supabase
            .from('surveys')
            .delete()
            .neq('연번', -1); // 모든 행을 선택하는 트릭

        if (deleteError) {
            console.error('삭제 실패:', deleteError.message);
            return;
        }
        console.log('기존 데이터가 모두 삭제되었습니다.');

        // 2. 로컬 파일 읽기
        console.log('--- [2/3] 새 데이터 준비 ---');
        if (!fs.existsSync('survey_data.json')) {
            console.error('오류: survey_data.json 파일이 없습니다. 먼저 python inspect_excel.py를 실행하세요.');
            return;
        }

        const rawData = JSON.parse(fs.readFileSync('survey_data.json', 'utf-8'));
        const localRows = rawData.data || rawData;

        if (!localRows || localRows.length === 0) {
            console.log('업로드할 새 데이터가 없습니다.');
            return;
        }

        const rowsToUpload = localRows.map(row => ({
            '연번': row['연번'],
            '실태조사 완료여부': '대기', // 새 장소이므로 모두 '대기'로 초기화
            '시설명': row['시설명'],
            '지번주소': row['지번주소'] || row['도로명주소'] || '주소 없음',
            '조사자': row['조사자5'] || row['조사자'] || '미지정',
            '조사일자': null // 날짜 초기화
        }));

        // 3. 새 데이터 업로드
        console.log(`--- [3/3] ${rowsToUpload.length}개의 새 데이터 업로드 시작 ---`);
        const { error: insertError } = await supabase
            .from('surveys')
            .insert(rowsToUpload);

        if (insertError) {
            console.error('업로드 실패:', insertError.message);
            return;
        }

        console.log('--- 모든 작업 완료! ---');
        console.log('새로운 장소들로 지도가 업데이트되었습니다.');

    } catch (e) {
        console.error('예기치 못한 오류:', e.message);
    }
}

clearAndSync();
